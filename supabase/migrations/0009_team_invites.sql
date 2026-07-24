-- Emblem OS — team-order to Coach OS bridge
--
-- Squad orders have never had a path from purchase into a coach's Coach
-- OS roster: order-enquiry creates players with no team_id and no
-- teams/clubs row, and approve/route.ts explicitly skips any bridging
-- for multi-card orders. This closes that gap.
--
-- Club/team identity is resolved by a staff member at order-approval
-- time, not auto-created from checkout free text — auto-matching risks
-- silently merging two different real clubs that share a common name,
-- and always-creating-new guarantees duplicate club rows with no
-- cleanup path, which would undermine future Club OS/League OS work
-- that needs canonical club records. A human recognizes name variants;
-- string-matching doesn't. club_name/team_name below are only the
-- checkout-typed hint, prefilled into the staff picker — never applied
-- automatically.
alter table orders add column club_name text;
alter table orders add column team_name text;

-- Mirrors player_invites' shape for a team instead of a player. Narrower
-- on purpose — a single-use invite code sent to the order's purchaser,
-- redeemable into a coach_team row. No origin enum: this table only
-- ever serves one purpose today.
create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references profiles (id),
  invited_email text,
  used_at timestamptz,
  used_by uuid references profiles (id),
  order_id uuid references orders (id),
  created_at timestamptz not null default now()
);

alter table team_invites enable row level security;

-- No insert/update policy — every write goes through the service-role
-- client (order-approval trigger, the redeem route), mirroring cards'
-- existing "no insert policy at all" convention.
create policy "team_invites: coaches can view their team's invites"
  on team_invites for select
  using (
    exists (
      select 1 from coach_team ct
      where ct.team_id = team_invites.team_id and ct.profile_id = auth.uid()
    )
  );
