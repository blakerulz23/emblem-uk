-- Pricing project — Stage 2: nullable order-pricing snapshot columns and
-- an order line-items table. Schema only — no code path reads or writes
-- any of this yet (the shared engine landed in Stage 1 as a pure,
-- unconnected module: src/lib/pricing-engine.ts). Wiring it into
-- order-enquiry, the builder, Shopify, or the webhook is a later,
-- separately-approved stage.
--
-- Every production read/write of `orders` was audited before writing this
-- (src/app/api/orders/intent, order-enquiry, orders/[id]/approve,
-- orders/[id]/resend-invite, webhooks/shopify/orders-paid, os/recover,
-- staff/queue/page.tsx) — every one of them selects an explicit column
-- list or inserts/updates explicit fields, never `select('*')`. This repo
-- also has no generated Supabase types file (confirmed again here; see
-- 0037_service_role_least_privilege.sql's own note that the client is
-- untyped throughout). Adding nullable columns below is therefore purely
-- additive: no existing insert, select, or type can be affected.

-- ---------------------------------------------------------------------------
-- orders — nullable pricing snapshot. Every column here is optional and
-- carries no default (not even `default null`, and deliberately never
-- `default now()` on priced_at) so that:
--   (a) every historical order keeps reading back as entirely NULL across
--       these columns — a Postgres ADD COLUMN ... DEFAULT <constant>
--       would apply that default to *existing* rows too, not just new
--       ones, which is exactly the "legacy orders appear priced" outcome
--       this must avoid — so no DEFAULT clause is used anywhere below.
--   (b) every current order-creation path keeps working completely
--       unmodified, since none of them mention these columns.
-- `orders` already has a table-level
-- `grant select, insert, update on public.orders to service_role`
-- (0037_service_role_least_privilege.sql) and a client-facing
-- `orders: purchaser can view their own` SELECT policy
-- (0003_claiming_and_rosters.sql) — both apply to whole rows, so no new
-- grant or policy is needed for these columns to eventually be written by
-- service-role code and read back by the owning purchaser once a later
-- stage actually populates them.
-- ---------------------------------------------------------------------------
alter table orders add column currency text check (currency in ('GBP'));
alter table orders add column pricing_tier text check (pricing_tier in ('single', 'multi', 'squad'));
-- Integrity amendment: strictly positive (not merely non-negative) when
-- present — a populated snapshot describing zero paid players or zero
-- printed copies is not a real order, it's a malformed one. NULL still
-- passes both (Postgres treats a NULL operand as satisfying a CHECK), so
-- every historical order is untouched.
alter table orders add column paid_player_count integer check (paid_player_count > 0);
alter table orders add column total_print_quantity integer check (total_print_quantity > 0);
alter table orders add column unit_price_pence integer check (unit_price_pence >= 0);
alter table orders add column subtotal_pence integer check (subtotal_pence >= 0);
alter table orders add column delivery_pence integer check (delivery_pence >= 0);
alter table orders add column tax_pence integer check (tax_pence >= 0);
alter table orders add column total_pence integer check (total_pence >= 0);
-- Simple incrementing counter identifying which pricing-rule revision
-- produced this snapshot (not the app's package/deploy version) — lets a
-- future rule change (a new tier, a repriced threshold) be told apart
-- from Stage 2's initial rules without re-deriving it from `priced_at`
-- against a deploy log. No code assigns a value yet; starts at 1 whenever
-- Stage 3 begins writing these columns.
alter table orders add column pricing_version integer check (pricing_version >= 1);
alter table orders add column priced_at timestamptz;

-- Historical orders (payment_status already 'paid'/'fulfilled' from before
-- this migration) are untouched by the statements above — an ADD COLUMN
-- with no DEFAULT leaves every existing row NULL in the new columns,
-- full stop. Nothing below backfills or guesses a value for them.

-- ---------------------------------------------------------------------------
-- Integrity amendment — four table-level constraints on `orders`, added the
-- same way 0012_moments_verification_status_check.sql added a coherence
-- constraint to an existing table with live rows: `alter table ... add
-- constraint ... check (...)`, validated immediately against every existing
-- row. Every one of these is written so an all-NULL row (every historical
-- order, today) satisfies it — Postgres treats a NULL operand as
-- constraint-satisfying, not violating, so none of this requires NOT VALID
-- or a backfill.
-- ---------------------------------------------------------------------------

-- 1b. total_print_quantity must cover every paid player at least once.
-- Cross-column, so it has to be a table-level (not column-level) check.
alter table orders add constraint orders_print_quantity_covers_players
  check (total_print_quantity >= paid_player_count);

-- 2. Coherent core pricing snapshot: either every core field is NULL (an
-- unpriced/legacy order) or every core field is populated (a real
-- snapshot) — never a partial mix. delivery_pence/tax_pence/total_pence
-- are deliberately excluded: Shopify may resolve those later than the
-- product-line snapshot itself, so they're allowed to lag behind rather
-- than being forced into the same all-or-none group.
alter table orders add constraint orders_pricing_snapshot_coherent
  check (
    (
      currency is null and pricing_tier is null and paid_player_count is null
      and total_print_quantity is null and unit_price_pence is null
      and subtotal_pence is null and pricing_version is null and priced_at is null
    )
    or
    (
      currency is not null and pricing_tier is not null and paid_player_count is not null
      and total_print_quantity is not null and unit_price_pence is not null
      and subtotal_pence is not null and pricing_version is not null and priced_at is not null
    )
  );

-- 3. Snapshot arithmetic: subtotal must equal quantity x unit price. Both
-- operands are cast to bigint before multiplying — `integer * integer` in
-- Postgres computes in 32-bit space and raises a hard "integer out of
-- range" error on overflow (a confusing low-level arithmetic exception,
-- not a clean constraint violation) rather than silently wrapping; casting
-- first guarantees the multiplication itself always succeeds and any real
-- mismatch is caught by the equality check instead, exactly like any other
-- constraint violation here.
alter table orders add constraint orders_pricing_snapshot_arithmetic
  check (subtotal_pence::bigint = total_print_quantity::bigint * unit_price_pence::bigint);

-- 4. Tier boundaries must match paid_player_count. Pinned to pricing-engine
-- v1's fixed thresholds (SINGLE = 1, MULTI = 2-9, SQUAD = 10+ — see
-- src/lib/pricing-engine.ts's MULTI_MIN_PLAYERS/SQUAD_MIN_PLAYERS). If a
-- future pricing_version ever needs different tier boundaries, this
-- constraint has to change in its own migration alongside that version —
-- it is not version-aware today, it only encodes v1's rule.
alter table orders add constraint orders_pricing_tier_matches_player_count
  check (
    pricing_tier is null
    or (pricing_tier = 'single' and paid_player_count = 1)
    or (pricing_tier = 'multi' and paid_player_count between 2 and 9)
    or (pricing_tier = 'squad' and paid_player_count >= 10)
  );

-- ---------------------------------------------------------------------------
-- order_line_items — one immutable commercial snapshot row per priced
-- item on an order: a player card (one row can represent one or more
-- paid copies of the same player via `quantity`), or the single free
-- coach card a Full Squad order unlocks. Rows are only ever written
-- alongside the pricing snapshot on `orders` above (a later stage) —
-- Stage 2 creates the table but nothing inserts into it yet.
--
-- `kind` intentionally has two values, not three: "paid player cards" and
-- "additional paid copies" (both named in the Stage 2 brief) are the same
-- commercial line — extra copies of a player's card raise `quantity` on
-- that kind, they are not a different kind of line. If a future stage
-- wants one row per physical copy instead of one row per player, that's a
-- write-time choice this schema doesn't need to prescribe.
-- ---------------------------------------------------------------------------
create table order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('player_card', 'coach_card')),
  description text not null,
  -- Loose, unenforced reference (e.g. a cards.id) — deliberately not a
  -- foreign key. A coach-card line has no real subject to point at yet
  -- (no coach/staff card model exists — a later, separately-approved
  -- stage adds one), so this column must stay optional and untyped-strict
  -- rather than forcing a fake target to satisfy a FK today.
  subject_reference_id uuid,
  quantity integer not null check (quantity > 0),
  unit_price_pence integer not null check (unit_price_pence >= 0),
  subtotal_pence integer not null check (subtotal_pence >= 0),
  -- A free coach-card line is quantity 1, unit_price_pence 0, so this
  -- constraint (unit_price 0 x quantity 1 = 0) already permits it without
  -- needing a `kind`-specific carve-out.
  constraint order_line_items_subtotal_matches_unit_price
    check (subtotal_pence = quantity * unit_price_pence),
  currency text not null check (currency in ('GBP')),
  -- Non-authoritative future display context only (e.g. a player's name
  -- at time of order, for a staff/customer summary screen) — never a
  -- second source of truth for price/quantity, which live in the typed
  -- columns above.
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_order_line_items_order_id on order_line_items (order_id);

alter table order_line_items enable row level security;

-- No grants, no policies — service-role only, matching claim_attempts'
-- original convention (0003_claiming_and_rosters.sql). Deliberately no
-- service_role grant either, unlike claim_attempts today: that grant was
-- added later, in 0037_service_role_least_privilege.sql, specifically
-- because and when a real, audited service-role code path started using
-- it. Nothing reads or writes order_line_items yet (Stage 2 is schema
-- only), so per that same migration's own stated discipline — "a future
-- table or route that needs service_role access requires its own
-- deliberate migration... must not grant anything to tables that do not
-- yet exist" — that grant belongs in the later stage that actually
-- connects a real write path, not here. Until then this table is
-- unreachable from any client (anon or authenticated) and from
-- service_role alike; only a direct Postgres superuser/migration
-- connection can touch it.
