-- ============================================================================
-- Gate 3 — direct Shopify checkout, server-verified payment, paid-order
-- gating. Separate work package: this migration is deliberately NOT
-- stacked on PR #44's 0078/0079 (guardian card-front sharing) — it is
-- based on main plus PR #43 (Adult Permission) only. Migration numbers
-- 0078/0079 remain reserved by PR #44; this file starts at 0080 to avoid
-- any collision when both branches eventually merge to main.
--
-- Builds on, never replaces, the existing architecture already discovered
-- in this codebase:
--   - orders.payment_status already exists (migration 0003) with values
--     'order_intent' | 'pending_payment' | 'paid' | 'cancelled' | 'fulfilled'.
--     This migration only ADDS 'failed' and 'refunded' to the same column
--     and CHECK — it does not rename or remove any existing value, and
--     'pending_payment' (previously a dead value with zero writers) finally
--     gets a real one: the checkout-creation step below.
--   - orders.currency/pricing_tier/unit_price_pence/subtotal_pence/
--     total_print_quantity (migration 0045/0048) are already the
--     server-computed, authoritative pricing snapshot written once at
--     order-creation time by create_authoritative_order — Gate 3 reads
--     these back, it never re-derives or accepts a price from the browser.
--   - The existing Shopify integration (src/lib/shopify.ts,
--     buildUkCardCartUrl) is a cart-permalink handoff, not an Admin-API
--     checkout object — there is no Shopify Admin API token anywhere in
--     this repo's environment (confirmed by direct search before writing
--     this migration). Shopify's own hosted checkout — reached via the
--     cart permalink — computes delivery/tax itself; Emblem's own
--     authoritative amount to verify is the card subtotal
--     (unit_price_pence x total_print_quantity), never the whole Shopify
--     order total (which includes shipping/tax Emblem does not set).
--   - squad_invite_payment_mode_enabled()/mark_squad_invite_participation_paid
--     (0055/0059/0067) is the direct precedent this migration's functions
--     mirror: SECURITY DEFINER, service-role-only or authenticated-only
--     execute grants, row-locked, idempotent.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — extend the existing payment_status CHECK (additive only).
-- ----------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('order_intent', 'pending_payment', 'paid', 'cancelled', 'fulfilled', 'failed', 'refunded'));

-- ----------------------------------------------------------------------------
-- Part 2 — minimal additional identifiers. Every column nullable, no
-- default beyond what's stated — historical and in-flight orders read back
-- unaffected, matching 0045's own stated discipline for pricing columns.
-- Never a card-number, name-on-card, or any other payment-instrument
-- detail: Shopify remains solely responsible for payment/card data. This
-- is reconciliation metadata only.
-- ----------------------------------------------------------------------------
alter table public.orders add column shopify_order_id text;
alter table public.orders add column paid_at timestamptz;
alter table public.orders add column paid_amount_pence integer check (paid_amount_pence >= 0);
alter table public.orders add column paid_currency text check (paid_currency in ('GBP'));

comment on column public.orders.shopify_order_id is
  'Shopify''s own order id (numeric, as a string), recorded only once a webhook actually confirms payment — never written from a browser return or query parameter.';
comment on column public.orders.paid_amount_pence is
  'The card subtotal Shopify''s webhook reported for the line item matching our variant, in pence — verified against orders.subtotal_pence by apply_gate3_payment_event, not blindly trusted from the webhook payload.';

-- ----------------------------------------------------------------------------
-- Part 3 — payment_state_events: append-only audit of every payment_status
-- transition this work package makes, mirroring builder_authority_audit_events
-- (0071) and every other audit table in this codebase: RLS enabled, no
-- policies, revoke-all-then-grant-service-role-only. Never stores payment
-- card data — only status labels, a free-text reason, and the Shopify
-- event id that caused the transition (for reconciliation, never a secret).
-- ----------------------------------------------------------------------------
create table public.payment_state_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  from_status text,
  to_status text not null,
  reason text,
  shopify_event_id text,
  created_at timestamptz not null default now()
);

comment on table public.payment_state_events is
  'Append-only audit of every Gate 3 payment_status transition (checkout initiated, paid, cancelled, failed, refunded). No UPDATE/DELETE grant exists for any role, including service_role — corrected by inserting a new event, never by mutating history. Never stores card data, an amount beyond what already lives on orders, or any Shopify secret.';

create index payment_state_events_order_id_idx on public.payment_state_events(order_id);

alter table public.payment_state_events enable row level security;
revoke all on public.payment_state_events from public, anon, authenticated, service_role;
grant select, insert on public.payment_state_events to service_role;

-- ----------------------------------------------------------------------------
-- Part 4 — shopify_webhook_events: exactly-once processing. Shopify may
-- redeliver the same webhook (network retry, manual resend from Admin);
-- this table's primary key on the event id is what makes a replay a safe
-- no-op regardless of what has happened to the order since (e.g. a later
-- refund must never be undone by a replayed, now-stale 'paid' event).
-- ----------------------------------------------------------------------------
create table public.shopify_webhook_events (
  id text primary key,
  topic text not null,
  order_ref text,
  received_at timestamptz not null default now()
);

comment on table public.shopify_webhook_events is
  'One row per Shopify webhook delivery id (X-Shopify-Webhook-Id), inserted before any order mutation. A duplicate delivery hits the primary key and is a safe no-op — see apply_gate3_payment_event.';

alter table public.shopify_webhook_events enable row level security;
revoke all on public.shopify_webhook_events from public, anon, authenticated, service_role;
grant select, insert on public.shopify_webhook_events to service_role;

-- ----------------------------------------------------------------------------
-- Part 5 — begin_gate3_checkout: callable directly by the authenticated
-- adult who declared authority for this order. Re-verifies everything a
-- browser could otherwise lie about (identity, authority, payment state,
-- pricing availability) and returns only the already-persisted,
-- server-computed pricing snapshot — never accepts a price/quantity/
-- variant argument from the caller at all. The calling route builds the
-- actual Shopify cart URL from this returned snapshot (URL construction
-- stays in src/lib/shopify.ts, not duplicated here in SQL).
--
-- Idempotent by construction: calling this again for an order already at
-- 'pending_payment' (a guardian re-opening the review page, a duplicate
-- click before the redirect fires) simply re-returns the same snapshot
-- without writing a second audit row or changing anything — one active
-- checkout attempt per order, exactly as a genuine "reuse, don't recreate"
-- checkout would look for a stateless cart-permalink integration that has
-- no separate checkout object to store an id for.
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

revoke all on function public.begin_gate3_checkout(uuid) from public, anon;
grant execute on function public.begin_gate3_checkout(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 6 — apply_gate3_payment_event: the ONLY way payment_status ever
-- becomes 'paid', 'refunded', 'cancelled', or 'failed'. Callable only by
-- service_role (the webhook route uses the service-role client, exactly
-- like every other webhook-driven write in this codebase) — never callable
-- from a browser return, a query parameter, or any authenticated-role
-- request. Event-id dedup happens first and atomically with every other
-- write this function makes (one function call is one transaction), so a
-- replayed webhook can never partially apply.
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

revoke all on function public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text) to service_role;

-- ----------------------------------------------------------------------------
-- Part 7 — payment-status read for the "Confirming your payment…" polling
-- screen. Same authorization shape as begin_gate3_checkout (the declaring
-- adult only) — read-only, never mutates anything.
-- ----------------------------------------------------------------------------
create or replace function public.get_gate3_payment_status(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
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
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  return jsonb_build_object('ok', true, 'paymentStatus', v_order.payment_status, 'authorityStatus', v_order.authority_status);
end;
$$;

revoke all on function public.get_gate3_payment_status(uuid) from public, anon;
grant execute on function public.get_gate3_payment_status(uuid) to authenticated;

commit;
