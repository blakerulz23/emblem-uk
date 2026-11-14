-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK LETS HELD ORDERS BE CHECKED OUT AND PAID FOR.
-- ============================================================================
-- Reverses 0102_held_orders_checkout_payment_and_fresh_approval.sql: restores
-- begin_gate3_checkout and apply_gate3_payment_event to their 0101 bodies,
-- create_builder_guardian_approval_request and
-- respond_to_builder_guardian_approval to their 0071 bodies, and the 0071
-- audit event types, exactly. Prefer fixing forward.
--
-- It refuses to run, changing nothing, unless:
--   - 0102 is applied;
--   - no order is held and unfinished (order_intent, pending_payment or
--     paid): without 0102 such an order could be paid for;
--   - no audit event of a 0102 type exists (the 0071 rule could not hold it;
--     the audit is append-only);
--   - the SAME TRANSACTION first sets this exact acknowledgement,
--     transaction-local:
--
--   begin;
--   select set_config('emblem.acknowledge_0102_rollback', 'ALLOW-HELD-ORDER-PAYMENT', true);
--   -- then this file, in the same transaction
--
-- Refused payments recorded by 0102 (payment_state_events reason
-- 'paid_refused_order_held...') are append-only history and stay.
begin;

do $$
declare
  v_n bigint;
begin
  if current_setting('emblem.acknowledge_0102_rollback', true) is distinct from 'ALLOW-HELD-ORDER-PAYMENT' then
    raise exception '0102 rollback refused: it lets held orders be checked out and paid for. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0102_rollback'', ''ALLOW-HELD-ORDER-PAYMENT'', true);';
  end if;
  if to_regprocedure('public.begin_gate3_checkout(uuid)') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.begin_gate3_checkout(uuid)')) not like '%order_held%' then
    raise exception '0102 rollback refused: 0102 is not applied';
  end if;
  select count(*) into v_n from public.orders
   where held_at is not null and payment_status in ('order_intent', 'pending_payment', 'paid');
  if v_n > 0 then
    raise exception '0102 rollback refused: % held order(s) are not finished; without 0102 they could be paid for. Fix forward instead.', v_n;
  end if;
  select count(*) into v_n from public.builder_authority_audit_events
   where event_type in ('guardian_request_restarted_after_hold', 'hold_released_by_guardian_approval');
  if v_n > 0 then
    raise exception '0102 rollback refused: % audit event(s) of a 0102 type are recorded; the audit is append-only. Fix forward instead.', v_n;
  end if;
end;
$$;

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
  v_gift_block text;
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

  -- 0101 (R5): a gift order needs a genuine guardian approval, not one
  -- from the buyer's own address. Checked after 0080's paid/closed refusals (unchanged order) and before anything is written. A
  -- failed check refuses checkout (fail closed).
  begin
    v_gift_block := public.gift_order_checkout_block_reason(v_order.id);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'gift_approval_unverified');
  end;
  if v_gift_block is not null then
    return jsonb_build_object('ok', false, 'reason', 'gift_approval_invalid');
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
  v_gift_block text;
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
    -- 0101 (R5): never mark a gift order paid without a genuine guardian
    -- approval. The refused payment is recorded (append-only) and the
    -- caller alerts staff to hold and refund. Not wrapped in an exception
    -- handler on purpose: if the check errors, this whole call (including
    -- the dedup row above) rolls back, nothing is marked paid, and Shopify
    -- retries the delivery.
    v_gift_block := public.gift_order_checkout_block_reason(v_order.id);
    if v_gift_block is not null then
      insert into public.payment_state_events (order_id, from_status, to_status, shopify_event_id, reason)
      values (
        v_order.id, v_order.payment_status, v_order.payment_status, p_shopify_event_id,
        'paid_refused_gift_approval_invalid' || coalesce(':shopify_order_id=' || p_shopify_order_id, '')
      );
      return jsonb_build_object('applied', false, 'reason', 'gift_approval_invalid', 'orderId', v_order.id);
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

create or replace function public.create_builder_guardian_approval_request(
  p_order_id uuid,
  p_guardian_email text,
  p_token_hash text,
  p_declaration_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status text;
  v_id uuid;
begin
  if p_guardian_email is null or length(trim(p_guardian_email)) < 3 or position('@' in p_guardian_email) = 0 then
    raise exception 'a valid guardian email is required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'a valid token_hash is required';
  end if;

  select authority_status into v_order_status from public.orders where id = p_order_id for update;
  if v_order_status is distinct from 'guardian_approval_pending' then
    raise exception 'order is not awaiting guardian approval';
  end if;

  -- Superseding an existing pending request (a retry with a corrected
  -- email, or a legitimate resend after a failed email delivery)
  -- invalidates the old token outright rather than leaving two live
  -- tokens for the same order. Safe from races with a concurrent caller
  -- because of the row lock taken above — no other call for this same
  -- order_id can be executing this statement at the same time.
  update public.builder_guardian_approval_requests
    set status = 'revoked'
    where order_id = p_order_id and status = 'pending';

  insert into public.builder_guardian_approval_requests (
    order_id, guardian_email, token_hash, declaration_version, expires_at
  ) values (
    p_order_id, lower(trim(p_guardian_email)), p_token_hash, p_declaration_version, now() + interval '14 days'
  )
  returning id into v_id;

  insert into public.builder_authority_audit_events (order_id, event_type)
    values (p_order_id, 'guardian_request_created');

  return jsonb_build_object('ok', true, 'requestId', v_id);
end;
$$;

create or replace function public.respond_to_builder_guardian_approval(
  p_token_hash text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
begin
  if p_decision is null or p_decision not in ('approved', 'declined') then
    raise exception 'invalid decision';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    -- Generic failure, matching card-lookup.ts's own discipline of never
    -- distinguishing "wrong token" from "expired" from "already used" in
    -- a way that helps an attacker enumerate — see the unavailable-page
    -- requirement in the product spec.
    return jsonb_build_object('ok', false);
  end if;

  -- Row-locked so a double-click (or a guardian tapping Approve then
  -- Decline before the first response lands) can't race two concurrent
  -- calls past the pending check below and each apply their own decision —
  -- the second call blocks until the first commits, then sees the
  -- already-updated (no longer 'pending') row and returns ok:false, same
  -- as any other already-used token.
  select * into v_request
  from public.builder_guardian_approval_requests
  where token_hash = p_token_hash
  for update;

  if v_request is null then
    return jsonb_build_object('ok', false);
  end if;

  if v_request.status <> 'pending' or v_request.expires_at < now() then
    -- Same jsonb_build_object('ok', false) shape as the malformed-hash and
    -- unknown-token branches above — this used to also return the row's
    -- real status ('expired'/'revoked'/'approved'/'declined'), which let a
    -- caller with the RPC's raw return value distinguish "this token once
    -- existed" from "this token never existed", a minor existence oracle.
    -- The real status is still visible to staff via a direct row read
    -- (service-role only) — it is only withheld from this function's return
    -- value, which is what an untrusted caller ultimately sees.
    return jsonb_build_object('ok', false);
  end if;

  update public.builder_guardian_approval_requests
    set status = p_decision, responded_at = now()
    where id = v_request.id;

  update public.orders
    set authority_status = case when p_decision = 'approved' then 'guardian_approved' else 'guardian_declined' end
    where id = v_request.order_id;

  insert into public.builder_authority_audit_events (order_id, event_type)
    values (v_request.order_id, case when p_decision = 'approved' then 'guardian_approved' else 'guardian_declined' end);

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

alter table public.builder_authority_audit_events drop constraint builder_authority_audit_events_event_type_check;
alter table public.builder_authority_audit_events add constraint builder_authority_audit_events_event_type_check
  check (event_type in (
    'declaration_recorded', 'authority_linked_confirmed', 'authority_linked_pending',
    'guardian_request_created', 'guardian_approved', 'guardian_declined',
    'guardian_request_expired', 'guardian_request_revoked', 'staff_approval_blocked'
  ));

-- Never let the acknowledgement outlive this transaction.
select set_config('emblem.acknowledge_0102_rollback', '', false);

commit;
