-- Emblem OS — Phase 1: card-first claiming, real rosters, order capture
--
-- Introduces `cards` as its own entity, deliberately separate from `players`.
-- A player is the permanent identity (Core Product Principle #1); a card is
-- a claimable *relationship* to a player (#4), with its own lifecycle
-- (unassigned -> assigned -> claimed) independent of the player record.
--
-- `cards.claim_token` is Phase 1's rotatable, human-typed stand-in for a
-- real card tap (#9) — a leaked token can be invalidated by issuing a new
-- card row without ever touching the player. `cards.nfc_uid` is reserved,
-- unused, for a real NFC chip's permanent hardware UID once that lands —
-- keeping the two concepts on separate columns from day one avoids ever
-- having to migrate a hardware UID out of a column that was also used as a
-- rotatable secret.

-- ---------------------------------------------------------------------------
-- players: one new column, no claim/card fields land here
-- ---------------------------------------------------------------------------
alter table players add column squad_number int;

-- ---------------------------------------------------------------------------
-- orders — a purchase, never itself proof of a real player or a guardian.
-- The purchaser is not automatically a guardian (Core Product Principle #7).
-- ---------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text unique not null,
  purchaser_email text not null,
  intended_guardian_email text,
  source text not null check (source in ('team_order', 'standalone_order')),
  -- A bare Shopify cart redirect is never proof of purchase (no webhook/Admin
  -- API access exists in this environment) — payment_status starts at
  -- 'order_intent' and only a manual staff action (src/app/staff/queue)
  -- advances it to 'fulfilled' for now. Real vocabulary is used so a future
  -- webhook can advance this without a schema change.
  payment_status text not null default 'order_intent'
    check (payment_status in ('order_intent', 'pending_payment', 'paid', 'cancelled', 'fulfilled')),
  created_at timestamptz not null default now()
);

alter table orders enable row level security;

grant select on orders to authenticated;

-- The only client-facing policy this table has. No insert/update policy —
-- every write (order capture, staff approval) happens server-side via the
-- service-role client, since a purchaser has no session at order time.
create policy "orders: purchaser can view their own"
  on orders for select
  using (purchaser_email = auth.email());

-- ---------------------------------------------------------------------------
-- cards — the claimable object. A card can exist unassigned (future
-- pre-printed stock), assigned to a player but not yet claimed, or claimed.
-- ---------------------------------------------------------------------------
create table cards (
  id uuid primary key default gen_random_uuid(),
  claim_token text unique not null,
  nfc_uid text unique, -- reserved for a real NFC chip UID; unused in Phase 1
  player_id uuid references players (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  status text not null default 'assigned'
    check (status in ('unassigned', 'assigned', 'claimed')),
  created_at timestamptz not null default now()
);

alter table cards enable row level security;

grant select on cards to authenticated;

-- No insert/update/delete policy at all — a claim_token must never be
-- creatable, guessable, or writable via an ordinary authenticated request.
-- Every write goes through server routes using the service-role client.
create policy "cards: visible to guardians of the player"
  on cards for select
  using (
    player_id is not null
    and exists (
      select 1 from guardians g
      where g.player_id = cards.player_id and g.profile_id = auth.uid()
    )
  );

create policy "cards: visible to coaches of the player's team"
  on cards for select
  using (
    player_id is not null
    and exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = cards.player_id and ct.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- player_invites — the single mechanism behind both "invite a second
-- guardian" (from inside the app) and "hand off to the right parent" (from
-- the no-card purchaser-recovery flow). Expiring and single-use, unlike a
-- card's claim_token which is meant to be reused by the physical card
-- itself until first claimed.
-- ---------------------------------------------------------------------------
create table player_invites (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references profiles (id),
  invited_email text,
  used_at timestamptz,
  used_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table player_invites enable row level security;

grant select, insert on player_invites to authenticated;

create policy "player_invites: guardians can view/create for their player"
  on player_invites for select
  using (
    exists (
      select 1 from guardians g
      where g.player_id = player_invites.player_id and g.profile_id = auth.uid()
    )
  );

create policy "player_invites: coaches can view/create for their team"
  on player_invites for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_invites.player_id and ct.profile_id = auth.uid()
    )
  );

create policy "player_invites: guardians can create for their player"
  on player_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from guardians g
      where g.player_id = player_invites.player_id and g.profile_id = auth.uid()
    )
  );

create policy "player_invites: coaches can create for their team"
  on player_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_invites.player_id and ct.profile_id = auth.uid()
    )
  );

-- Redeeming a code (a stranger with no relationship to the player yet) goes
-- through the service-role client in the API route, same reasoning as the
-- card claim_token lookup below — RLS has no policy for that case by design.

-- ---------------------------------------------------------------------------
-- claim_attempts — rate-limiting / abuse logging for the pre-auth code
-- lookup routes (card claim_token and invite code). Service-role writes
-- only; no client access at all.
-- ---------------------------------------------------------------------------
create table claim_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null, -- caller IP or equivalent
  code_attempted text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

alter table claim_attempts enable row level security;
-- No grants, no policies — service-role only.

create index idx_claim_attempts_identifier_created on claim_attempts (identifier, created_at);

-- ---------------------------------------------------------------------------
-- clubs / teams / coach_team / players — coach self-serve creation.
-- (0001_init.sql only had SELECT policies on clubs/teams and coach_team;
-- players had no insert policy at all.)
-- ---------------------------------------------------------------------------
create policy "clubs: coaches can create"
  on clubs for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'coach')
  );

create policy "teams: coaches can create"
  on teams for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'coach')
  );

create policy "coach_team: a coach can attach themselves"
  on coach_team for insert
  with check (auth.uid() = profile_id);

create policy "players: coaches can add roster players to their team"
  on players for insert
  with check (
    team_id is not null
    and exists (
      select 1 from coach_team ct
      where ct.team_id = players.team_id and ct.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- guardians — self-link insert policy, kept as a baseline/defense-in-depth
-- backstop. The authoritative check ("was the right claim_token or invite
-- code actually presented, and is the card/invite still valid to redeem")
-- happens in the API routes (src/app/api/os/claim, src/app/api/os/invites)
-- using the service-role client for the actual insert, immediately after
-- that verification — RLS alone can't see what secret a request presented,
-- only stored row state, so it isn't the right place to enforce that part.
-- ---------------------------------------------------------------------------
create policy "guardians: a parent can link themselves"
  on guardians for insert
  with check (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- Indexes for the lookups these flows actually do
-- ---------------------------------------------------------------------------
create index idx_cards_player on cards (player_id);
create index idx_cards_order on cards (order_id);
create index idx_orders_purchaser_email on orders (purchaser_email);
create index idx_player_invites_player on player_invites (player_id);
