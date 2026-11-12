-- ============================================================================
-- Rollback for 0099_gift_checkout_requires_guardian_approval.sql. EMERGENCY
-- ONLY.
--
-- Restores begin_gate3_checkout and apply_gate3_payment_event to their 0080
-- bodies (copied verbatim from 0080_gate3_payment_state.sql) and drops
-- gift_order_checkout_block_reason. CREATE OR REPLACE keeps both functions'
-- owner and grants, so the result is the exact pre-0099 catalog (proven in
-- supabase/tests/authz/migration_0099_test.mjs).
--
-- Rolling back REOPENS R5: a buyer whose gift order was approved from their
-- own address can open checkout and pay again, and the payment is marked
-- paid. Production stays blocked by the app (approve route), so a rollback
-- must be paired with the staff instruction to hold and refund any such
-- order. It refuses without a transaction-local acknowledgement, and the
-- acknowledgement never persists past this transaction.
--
-- Changes no data. payment_state_events rows written by 0099 (reason
-- paid_refused_gift_approval_invalid...) are append-only history and stay.
-- ============================================================================

begin;

do $$
begin
  if current_setting('emblem.acknowledge_0099_rollback', true) is distinct from 'REOPEN-SELF-APPROVED-GIFT-CHECKOUT' then
    raise exception '0099 rollback refused: it lets self-approved gift orders reach checkout and payment again (R5). To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0099_rollback'', ''REOPEN-SELF-APPROVED-GIFT-CHECKOUT'', true);';
  end if;
  if to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is null then
    raise exception '0099 rollback refused: gift_order_checkout_block_reason does not exist (0099 is not applied)';
  end if;
end;
$$;

-- begin_gate3_checkout, exactly as 0080 created it.
create or replace function public.begin_gate3_checkout(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_declaration record;
  v_order record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_declaration
  from public.builder_order_authority_declarations
  where order_id = p_order_id;

  if v_declaration.id is null or v_declaration.adult_user_id is distinct from auth.uid() then
    -- Deliberately identical response whether the order doesn't exist, has
    -- no declaration yet, or belongs to a different adult — never lets a
    -- caller distinguish "wrong order id" from "not yours" from probing.
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_order.authority_status is distinct from 'confirmed' and v_order.authority_status is distinct from 'guardian_approved' then
    return jsonb_build_object('ok', false, 'reason', 'authority_not_confirmed');
  end if;

  if v_order.payment_status in ('paid', 'fulfilled') then
    return jsonb_build_object('ok', false, 'reason', 'already_paid');
  end if;
  if v_order.payment_status in ('cancelled', 'refunded', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'order_' || v_order.payment_status);
  end if;

  if v_order.unit_price_pence is null or v_order.total_print_quantity is null or v_order.currency is null or v_order.pricing_tier is null then
    -- The authoritative pricing snapshot was never written for this order
    -- (a pre-pricing-schema historical order, or a genuine bug upstream) —
    -- fail closed rather than construct a checkout with an unknown amount.
    return jsonb_build_object('ok', false, 'reason', 'pricing_not_available');
  end if;

  if v_order.payment_status = 'order_intent' then
    update public.orders set payment_status = 'pending_payment' where id = v_order.id;
    insert into public.payment_state_events (order_id, from_status, to_status, reason)
    values (v_order.id, 'order_intent', 'pending_payment', 'checkout_initiated');
  end if;

  return jsonb_build_object(
    'ok', true,
    'orderRef', v_order.order_ref,
    'pricingTier', v_order.pricing_tier,
    'quantity', v_order.total_print_quantity,
    'unitPricePence', v_order.unit_price_pence,
    'subtotalPence', v_order.subtotal_pence,
    'currency', v_order.currency
  );
end;
$$;

-- apply_gate3_payment_event, exactly as 0080 created it.
create or replace function public.apply_gate3_payment_event(
  p_order_id uuid,
  p_shopify_event_id text,
  p_topic text,
  p_to_status text,
  p_shopify_order_id text default null,
  p_amount_pence integer default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_inserted_event_id text;
begin
  if p_to_status not in ('paid', 'cancelled', 'failed', 'refunded') then
    raise exception 'invalid target payment status: %', p_to_status;
  end if;
  if p_shopify_event_id is null or length(trim(p_shopify_event_id)) = 0 then
    raise exception 'shopify_event_id is required';
  end if;

  -- Exactly-once: this insert is the dedup gate. A conflict means this
  -- exact webhook delivery was already processed — return immediately,
  -- before touching orders or payment_state_events at all.
  insert into public.shopify_webhook_events (id, topic, order_ref)
  select p_shopify_event_id, p_topic, o.order_ref from public.orders o where o.id = p_order_id
  on conflict (id) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    return jsonb_build_object('applied', false, 'reason', 'order_not_found');
  end if;

  if p_to_status = 'paid' then
    if v_order.payment_status in ('paid', 'fulfilled') then
      return jsonb_build_object('applied', false, 'reason', 'already_paid', 'orderId', v_order.id);
    end if;
    if v_order.payment_status in ('cancelled', 'refunded') then
      -- A late/out-of-order 'paid' event for an order already cancelled or
      -- refunded is never silently applied — flagged for reconciliation,
      -- not treated as authoritative over a later, more final state.
      return jsonb_build_object('applied', false, 'reason', 'order_' || v_order.payment_status, 'orderId', v_order.id);
    end if;
    update public.orders set
      payment_status = 'paid',
      paid_at = now(),
      shopify_order_id = coalesce(p_shopify_order_id, v_order.shopify_order_id),
      paid_amount_pence = p_amount_pence,
      paid_currency = p_currency
    where id = v_order.id;

  elsif p_to_status = 'refunded' then
    if v_order.payment_status is distinct from 'paid' and v_order.payment_status is distinct from 'fulfilled' then
      return jsonb_build_object('applied', false, 'reason', 'not_currently_paid', 'orderId', v_order.id);
    end if;
    update public.orders set payment_status = 'refunded' where id = v_order.id;

  elsif p_to_status = 'cancelled' then
    if v_order.payment_status in ('paid', 'fulfilled', 'refunded') then
      return jsonb_build_object('applied', false, 'reason', 'already_' || v_order.payment_status, 'orderId', v_order.id);
    end if;
    update public.orders set payment_status = 'cancelled' where id = v_order.id;

  elsif p_to_status = 'failed' then
    if v_order.payment_status in ('paid', 'fulfilled', 'refunded') then
      return jsonb_build_object('applied', false, 'reason', 'already_' || v_order.payment_status, 'orderId', v_order.id);
    end if;
    update public.orders set payment_status = 'failed' where id = v_order.id;
  end if;

  insert into public.payment_state_events (order_id, from_status, to_status, shopify_event_id, reason)
  values (v_order.id, v_order.payment_status, p_to_status, p_shopify_event_id, p_topic);

  return jsonb_build_object('applied', true, 'orderId', v_order.id, 'orderRef', v_order.order_ref, 'previousStatus', v_order.payment_status);
end;
$$;

drop function public.gift_order_checkout_block_reason(uuid);

select set_config('emblem.acknowledge_0099_rollback', '', false);

commit;
