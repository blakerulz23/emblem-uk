-- ============================================================================
-- 0102: held orders (0097, section 12) cannot be checked out or paid for, and
-- are resolved only by a fresh, genuine guardian approval through the normal
-- flow, or by cancellation / refund.
--
-- An order is held when the guardian it depends on (its named guardian, or
-- the guardian whose approval request was live) had their account erased
-- before the order finished. 0097 refuses approving or fulfilling a held
-- order and has no release override. This migration closes the payment side
-- and adds the only way back:
--   1. begin_gate3_checkout refuses a held order ('order_held'), including
--      re-opening a checkout that was started before the hold. Nothing is
--      written.
--   2. apply_gate3_payment_event never marks a held order paid. The 'paid'
--      event is recorded append-only in payment_state_events (reason
--      'paid_refused_order_held[:shopify_order_id=<id>]', with the delivery
--      id), the result is applied=false, reason 'order_held', and the webhook
--      route alerts staff to refund it. Refunded, cancelled and failed events
--      still apply.
--   3. create_builder_guardian_approval_request (the normal "name the
--      guardian" step) restarts a held order: only while it is unpaid
--      (order_intent or pending_payment; a paid held order must be refunded
--      or cancelled first, EMHLD 'held_order_paid_refund_or_cancel_first'),
--      and, when its approval was erased (0101 finds no genuine approval),
--      it returns to guardian_approval_pending (audited:
--      guardian_request_restarted_after_hold). The hold stays.
--   4. respond_to_builder_guardian_approval: an approval of a held, unpaid
--      order from a genuine guardian (0101's rule) lifts the hold in the same
--      transaction (audited: hold_released_by_guardian_approval). The 0097
--      trigger re-checks this; nothing else can lift a hold.
--   5. builder_authority_audit_events accepts those two event types.
--
-- Everything else in the four functions is their current body (0101 for
-- checkout and payment, 0071 for the approval request and response),
-- unchanged. CREATE OR REPLACE keeps owners, SECURITY DEFINER, search_path
-- and grants. Runs after 0097 and 0101 in both orders (production:
-- 0101 -> 0097 -> 0098 -> 0102; numbered: 0097 -> 0098 -> 0101 -> 0102).
-- Rollback: supabase/rollback/0102_rollback.sql. Proven in
-- supabase/tests/authz/migration_0098_test.mjs (section 26) and
-- supabase/tests/authz/concurrency_0097_0102_test.mjs (real PostgreSQL).
--
-- DEPLOY ORDER: the app change (checkout route and orders/paid webhook route
-- handling 'order_held') must be live BEFORE this migration is applied, the
-- same rule as 0101: applied first, a refused payment would reach a route
-- that does not alert staff.
-- ============================================================================

begin;

do $$
declare
  v_problems text[] := '{}';
  v_begin regprocedure := to_regprocedure('public.begin_gate3_checkout(uuid)');
  v_apply regprocedure := to_regprocedure('public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)');
  v_create regprocedure := to_regprocedure('public.create_builder_guardian_approval_request(uuid, text, text, text)');
  v_respond regprocedure := to_regprocedure('public.respond_to_builder_guardian_approval(text, text)');
  v_def text;
begin
  if (v_begin is not null and (select prosrc from pg_proc where oid = v_begin) like '%order_held%')
     or (v_create is not null and (select prosrc from pg_proc where oid = v_create) like '%restarted_after_hold%') then
    raise exception '0102 refused: 0102 is already applied';
  end if;
  if to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is null
     or v_begin is null or (select prosrc from pg_proc where oid = v_begin) not like '%gift_approval_invalid%'
     or v_apply is null or (select prosrc from pg_proc where oid = v_apply) not like '%paid_refused_gift_approval_invalid%' then
    v_problems := v_problems || '0101 is not applied (gift checkout gate missing)'::text;
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
       and column_name in ('held_at', 'held_reason', 'intended_guardian_erased_at')) <> 3
     or to_regprocedure('public.redact_order_guardian_addresses(uuid, text)') is null
     or to_regprocedure('public.email_match_key(text)') is null
     or not exists (select 1 from pg_trigger where tgname = 'orders_held_guard' and tgrelid = 'public.orders'::regclass
                    and not tgisinternal and tgenabled <> 'D') then
    v_problems := v_problems || '0097 section 12 is not applied (holds missing)'::text;
  end if;
  if v_create is null or (select prosrc from pg_proc where oid = v_create) not like '%order is not awaiting guardian approval%'
     or v_respond is null or (select prosrc from pg_proc where oid = v_respond) not like '%guardian_declined%'
     or (select prosrc from pg_proc where oid = v_respond) like '%held_at%' then
    v_problems := v_problems || 'the approval request functions are not the 0071 definitions'::text;
  end if;
  if v_begin is not null and (not has_function_privilege('authenticated', v_begin, 'execute') or has_function_privilege('anon', v_begin, 'execute')) then
    v_problems := v_problems || 'begin_gate3_checkout grants differ from 0080'::text;
  end if;
  if v_apply is not null and (has_function_privilege('authenticated', v_apply, 'execute') or has_function_privilege('anon', v_apply, 'execute')
     or not has_function_privilege('service_role', v_apply, 'execute')) then
    v_problems := v_problems || 'apply_gate3_payment_event grants differ from 0080'::text;
  end if;
  if (v_create is not null and (has_function_privilege('authenticated', v_create, 'execute') or not has_function_privilege('service_role', v_create, 'execute')))
     or (v_respond is not null and (has_function_privilege('authenticated', v_respond, 'execute') or not has_function_privilege('service_role', v_respond, 'execute'))) then
    v_problems := v_problems || 'approval request function grants differ from 0071'::text;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.builder_authority_audit_events'::regclass and conname = 'builder_authority_audit_events_event_type_check';
  if v_def is null or v_def like '%hold_released_by_guardian_approval%' or v_def not like '%staff_approval_blocked%' then
    v_problems := v_problems || ('builder_authority_audit_events_event_type_check is not the 0071 rule: ' || coalesce(v_def, 'missing'));
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0102 refused: the expected state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. The two new audit event types.
-- ----------------------------------------------------------------------------
alter table public.builder_authority_audit_events drop constraint builder_authority_audit_events_event_type_check;
alter table public.builder_authority_audit_events add constraint builder_authority_audit_events_event_type_check
  check (event_type in (
    'declaration_recorded', 'authority_linked_confirmed', 'authority_linked_pending',
    'guardian_request_created', 'guardian_approved', 'guardian_declined',
    'guardian_request_expired', 'guardian_request_revoked', 'staff_approval_blocked',
    'guardian_request_restarted_after_hold', 'hold_released_by_guardian_approval'
  ));

-- ----------------------------------------------------------------------------
-- 1. begin_gate3_checkout: 0101 body plus the hold refusal.
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

  -- 0102: a held order (the guardian it depends on had their account
  -- erased, 0097) cannot be checked out, including re-opening a checkout
  -- started before the hold.
  if v_order.held_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'order_held');
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

-- ----------------------------------------------------------------------------
-- 2. apply_gate3_payment_event: 0101 body plus the hold refusal on 'paid'.
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
    -- 0102: never mark a held order paid. The refused payment is recorded
    -- (append-only, with the delivery id and Shopify order id) and the caller
    -- alerts staff to refund it. Closing events (refunded, cancelled, failed)
    -- still apply to a held order.
    if v_order.held_at is not null then
      insert into public.payment_state_events (order_id, from_status, to_status, shopify_event_id, reason)
      values (
        v_order.id, v_order.payment_status, v_order.payment_status, p_shopify_event_id,
        'paid_refused_order_held' || coalesce(':shopify_order_id=' || p_shopify_order_id, '')
      );
      return jsonb_build_object('applied', false, 'reason', 'order_held', 'orderId', v_order.id);
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

-- ----------------------------------------------------------------------------
-- 3. create_builder_guardian_approval_request: 0071 body plus the restart of a
--    held, unpaid order.
-- ----------------------------------------------------------------------------
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
  v_payment_status text;
  v_held_at timestamptz;
  v_id uuid;
begin
  if p_guardian_email is null or length(trim(p_guardian_email)) < 3 or position('@' in p_guardian_email) = 0 then
    raise exception 'a valid guardian email is required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'a valid token_hash is required';
  end if;

  select authority_status, payment_status, held_at into v_order_status, v_payment_status, v_held_at
    from public.orders where id = p_order_id for update;
  -- 0102: a held order (its guardian's account was erased, 0097) restarts
  -- only through this normal flow, and only while unpaid: a paid held order
  -- must be refunded or cancelled first. If its approval is gone (redacted,
  -- so 0101 finds no genuine approval), it goes back to awaiting approval;
  -- the hold stays until the new guardian approves (respond, below).
  if v_held_at is not null then
    if v_payment_status is distinct from 'order_intent' and v_payment_status is distinct from 'pending_payment' then
      raise exception using errcode = 'EMHLD', message = 'held_order_paid_refund_or_cancel_first';
    end if;
    if v_order_status = 'guardian_approved' and public.gift_order_checkout_block_reason(p_order_id) is not null then
      update public.orders set authority_status = 'guardian_approval_pending' where id = p_order_id;
      insert into public.builder_authority_audit_events (order_id, event_type)
        values (p_order_id, 'guardian_request_restarted_after_hold');
      v_order_status := 'guardian_approval_pending';
    end if;
  end if;
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

-- ----------------------------------------------------------------------------
-- 4. respond_to_builder_guardian_approval: 0071 body plus the hold release.
-- ----------------------------------------------------------------------------
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

  -- 0102: the only way a hold (0097) is lifted: a fresh approval of the
  -- still unpaid order, from an address that is neither the purchaser's nor
  -- a declaring adult's (0101's rule). The 0097 trigger checks the same
  -- conditions again in this write. An approval from the buyer's own address
  -- leaves the hold in place.
  if p_decision = 'approved' then
    update public.orders o
       set held_at = null, held_reason = null
     where o.id = v_request.order_id and o.held_at is not null
       and o.payment_status in ('order_intent', 'pending_payment')
       and public.gift_order_checkout_block_reason(o.id) is null;
    if found then
      insert into public.builder_authority_audit_events (order_id, event_type)
        values (v_request.order_id, 'hold_released_by_guardian_approval');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

commit;
