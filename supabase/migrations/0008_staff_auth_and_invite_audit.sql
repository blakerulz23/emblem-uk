-- Emblem OS — staff authentication + approval audit trail + invite audit
--
-- Closes the "no auth on /staff/queue or /api/orders/[id]/approve" gap
-- (ADR-6) as a blocking prerequisite for the post-approval customer
-- invitation work, not a deferred nice-to-have. See the staff-queue
-- gaps implementation plan for the full reasoning.
--
-- staff_accounts is deliberately NOT an extra value on profiles.role.
-- profiles' own update policy ("profiles: update own row", 0001_init.sql)
-- has a USING clause but no WITH CHECK and no column restriction — any
-- signed-in user can already update their own row via the same
-- session-scoped upsert pattern this app uses elsewhere (see
-- /api/os/teams). Adding 'staff' to profiles' role CHECK would let any
-- user grant themselves staff access the same way. A separate table with
-- RLS enabled and zero policies is secure by default: only the
-- service-role client (which bypasses RLS) can read or write it, and
-- there's no existing broad policy to accidentally reopen later.
create table staff_accounts (
  profile_id uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table staff_accounts enable row level security;
-- No policies. RLS enabled + zero grants = nobody via the session client,
-- including the row's own subject, can select/insert/update this table.

-- Approval audit trail — who approved this order, and when. Mirrors the
-- created_by/used_by pattern already used on player_invites.
alter table orders add column approved_by uuid references profiles (id);
alter table orders add column approved_at timestamptz;

-- player_invites: traceability for the post-approval invitation work.
-- origin distinguishes why an invite exists at all across the three
-- paths that now (or will) create one — useful for support/debugging,
-- not just this feature.
alter table player_invites add column order_id uuid references orders (id);
alter table player_invites add column origin text
  check (origin in ('order_approval', 'second_guardian', 'coach_added_player'));
alter table player_invites add column email_status text
  check (email_status in ('sent', 'failed', 'skipped_no_email'));
alter table player_invites add column email_sent_at timestamptz;
