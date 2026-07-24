-- Family Memory / Pending Verification / Coach Verified status model.
--
-- trust + verified_at alone can't represent this: neither field captures
-- "was an eligible coach assigned when this was submitted," and that fact
-- can't be reconstructed later from a player's current team/coach state
-- without silently rewriting history (a Family Memory reclassifying itself
-- into a brand-new coach's queue the instant a player later joins a team,
-- for an event that coach never witnessed). Status is therefore set once,
-- at submission/approval time, and never re-derived afterward.
alter table moments add column verification_status text
  check (verification_status in ('family_memory', 'pending_verification', 'coach_verified'));

-- Backfill. Already-verified rows map straight across.
update moments set verification_status = 'coach_verified' where verified_at is not null;

-- For existing unverified rows there's no record of whether an eligible
-- coach existed at the time each was actually submitted — only current
-- state is available. Using current team/coach assignment as the best
-- available proxy: a still-unverified moment for a player who currently
-- has a coach preserves what's already correctly happening today (it's
-- genuinely sitting in a real coach's queue right now); one for a
-- currently-no-team player becomes a Family Memory. This is a one-time
-- migration approximation — after this runs, no code path ever re-derives
-- verification_status from current state again.
update moments m set verification_status = 'pending_verification'
where m.verified_at is null
  and exists (
    select 1 from players p
    join coach_team ct on ct.team_id = p.team_id
    where p.id = m.player_id
  );

update moments set verification_status = 'family_memory' where verification_status is null;

alter table moments alter column verification_status set not null;
