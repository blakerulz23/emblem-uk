-- ============================================================================
-- 0099: gift-order checkout and payment require a genuine guardian approval
-- (R5).
--
-- A gift order (authority_status guardian_approval_pending / guardian_approved
-- / guardian_declined, migration 0071) is a card one adult (the buyer) makes
-- for someone else's child. It may only be paid for once the child's parent
-- or guardian has approved it from the emailed link.
--
-- An order approved from the buyer's own address (orders.purchaser_email, or
-- any builder_order_authority_declarations.adult_email for the order) is not
-- a guardian's approval. Since #138/#141 the app refuses such an order
-- everywhere downstream: staff can't approve it for production, and nobody
-- gets the child's profile from it. But begin_gate3_checkout (0080) only
-- checked authority_status = 'guardian_approved', so the buyer could still
-- open checkout and pay, and apply_gate3_payment_event marked it paid.
--
-- This migration:
--   1. adds public.gift_order_checkout_block_reason(order_id): the single
--      database statement of "may this order be paid for?". NULL (not
--      blocked) for every non-gift order: confirmed, historical NULL and
--      Squad Invite orders return before any approval table is read. For a
--      gift order it returns a reason unless the order is guardian_approved
--      AND its latest 'approved' approval request came from an address that
--      is neither the purchaser's nor any declaring adult's (trimmed,
--      lower-cased: the same rule as src/lib/gift-order-guardian.ts
--      loadApprovedGuardianEmail).
--   2. begin_gate3_checkout: refuses a blocked gift order with
--      'gift_approval_invalid', before anything is written (the order stays
--      at order_intent; no payment_state_events row). If the check itself
--      errors, it refuses with 'gift_approval_unverified' (fail closed).
--   3. apply_gate3_payment_event: a 'paid' event for a blocked gift order is
--      never applied. The order keeps its payment status, one append-only
--      payment_state_events row records the refused payment (reason
--      'paid_refused_gift_approval_invalid', with the Shopify order id when
--      known), and the result is applied=false, reason
--      'gift_approval_invalid' so the webhook route alerts staff to hold and
--      refund. If the check errors, the whole call raises and rolls back,
--      including the webhook dedup row, so nothing is marked paid and
--      Shopify retries the delivery (fail closed).
--
-- Everything else in both functions is 0080's body unchanged. CREATE OR
-- REPLACE keeps each function's owner, SECURITY DEFINER, search_path and
-- grants. No table, column, policy, grant on an existing object, or data
-- changes. Rollback: supabase/rollback/0099_rollback.sql.
-- Proven in supabase/tests/authz/migration_0099_test.mjs (PGlite).
--
-- DEPLOY ORDER: the app change (checkout and orders/paid routes) must be
-- live BEFORE this migration is applied. Applied first, a refused payment
-- would reach the old orders/paid route, which has no branch for
-- gift_approval_invalid and would not alert staff. App first is harmless:
-- its new branches simply never fire until 0099 is applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Precondition: the 0080 functions are in place, with 0080's grants, and
-- 0099 has not been applied. Refuses (changing nothing) otherwise.
-- ----------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
  v_begin regprocedure := to_regprocedure('public.begin_gate3_checkout(uuid)');
  v_apply regprocedure := to_regprocedure('public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)');
begin
  if to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is not null then
    raise exception '0099 refused: public.gift_order_checkout_block_reason already exists (0099 already applied)';
  end if;
  if v_begin is null then
    v_problems := v_problems || 'begin_gate3_checkout(uuid) is missing'::text;
  elsif not (select prosecdef from pg_proc where oid = v_begin)
        or (select prosrc from pg_proc where oid = v_begin) not like '%authority_not_confirmed%'
        or (select prosrc from pg_proc where oid = v_begin) like '%gift_approval%' then
    v_problems := v_problems || 'begin_gate3_checkout is not the 0080 function'::text;
  elsif not has_function_privilege('authenticated', v_begin, 'execute')
        or has_function_privilege('anon', v_begin, 'execute') then
    v_problems := v_problems || 'begin_gate3_checkout grants differ from 0080'::text;
  end if;
  if v_apply is null then
    v_problems := v_problems || 'apply_gate3_payment_event(...) is missing'::text;
  elsif not (select prosecdef from pg_proc where oid = v_apply)
        or (select prosrc from pg_proc where oid = v_apply) not like '%duplicate_event%'
        or (select prosrc from pg_proc where oid = v_apply) like '%gift_approval%' then
    v_problems := v_problems || 'apply_gate3_payment_event is not the 0080 function'::text;
  elsif has_function_privilege('authenticated', v_apply, 'execute')
        or has_function_privilege('anon', v_apply, 'execute')
        or not has_function_privilege('service_role', v_apply, 'execute') then
    v_problems := v_problems || 'apply_gate3_payment_event grants differ from 0080'::text;
  end if;
  if to_regclass('public.builder_guardian_approval_requests') is null
     or to_regclass('public.builder_order_authority_declarations') is null
     or to_regclass('public.payment_state_events') is null then
    v_problems := v_problems || 'a 0071/0080 table is missing'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0099 refused: the expected 0080 state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. gift_order_checkout_block_reason
-- ----------------------------------------------------------------------------
create function public.gift_order_checkout_block_reason(
  p_order_id uuid
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_order record;
  v_approver text;
begin
  select o.id, o.authority_status, o.purchaser_email into v_order
  from public.orders o where o.id = p_order_id;

  -- Not found, or not a gift order: confirmed, historical (NULL) and Squad
  -- Invite orders are never blocked here, and no approval table is read.
  if v_order.id is null
     or v_order.authority_status is null
     or v_order.authority_status not in ('guardian_approval_pending', 'guardian_approved', 'guardian_declined') then
    return null;
  end if;

  if v_order.authority_status is distinct from 'guardian_approved' then
    return 'gift_not_approved';
  end if;

  -- The approving address, from the approval request itself (the latest
  -- 'approved' one, as loadApprovedGuardianEmail reads it: PostgREST's
  -- descending order puts NULL responded_at first). Emails are trimmed of
  -- all leading/trailing whitespace (as JavaScript trim() does, including
  -- tabs, newlines, no-break and zero-width no-break spaces) and lower-cased.
  select lower(regexp_replace(r.guardian_email, '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) into v_approver
  from public.builder_guardian_approval_requests r
  where r.order_id = p_order_id and r.status = 'approved'
  order by r.responded_at desc nulls first, r.created_at desc
  limit 1;

  if v_approver is null or v_approver = '' then
    return 'gift_approval_missing';
  end if;

  if v_approver = lower(regexp_replace(coalesce(v_order.purchaser_email, ''), '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) then
    return 'gift_self_approved';
  end if;

  if exists (
    select 1 from public.builder_order_authority_declarations d
    where d.order_id = p_order_id and lower(regexp_replace(d.adult_email, '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) = v_approver
  ) then
    return 'gift_self_approved';
  end if;

  return null;
end;
$$;

revoke all on function public.gift_order_checkout_block_reason(uuid) from public, anon, authenticated;
grant execute on function public.gift_order_checkout_block_reason(uuid) to service_role;

comment on function public.gift_order_checkout_block_reason(uuid) is
  'R5 (0099): NULL when an order may be paid for; otherwise why a gift order may not (gift_not_approved, gift_approval_missing, gift_self_approved). Non-gift orders are always NULL and never read the approval tables. Same rule as src/lib/gift-order-guardian.ts loadApprovedGuardianEmail. Used by begin_gate3_checkout and apply_gate3_payment_event.';

-- ----------------------------------------------------------------------------
-- 2. begin_gate3_checkout: 0080 body plus the gift-approval check.
-- ----------------------------------------------------------------------------
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

  -- 0099 (R5): a gift order needs a genuine guardian approval, not one
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

-- ----------------------------------------------------------------------------
-- 3. apply_gate3_payment_event: 0080 body plus the gift-approval check on
--    'paid'.
-- ----------------------------------------------------------------------------
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
    -- 0099 (R5): never mark a gift order paid without a genuine guardian
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

commit;
