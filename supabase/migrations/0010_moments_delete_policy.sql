-- Fixes a real, currently-live bug: moments has no DELETE policy at all, so
-- POST /api/os/moments/verify's reject branch (supabase.from('moments')
-- .delete(), session-scoped client) has always silently matched zero rows
-- under RLS — the route still returned { ok: true }, but no moment was ever
-- actually deleted. Confirmed by direct inspection of both the route and
-- every existing migration before writing this fix.
--
-- This blocks Collection OS's approved design: moment_id's ON DELETE CASCADE
-- on the future collection_events table only does anything if rejected
-- moments are genuinely deleted.
--
-- Narrowly scoped, mirroring "moments: coaches can verify/update for their
-- team" (0001_init.sql) exactly — same join shape, same actor rule — plus
-- one extra restriction: only a still-pending (verified_at is null) moment
-- can be deleted this way. That restriction didn't matter before (nothing
-- could ever be deleted), but it matters now that delete actually works —
-- without it, this same policy would also let a coach delete an
-- already-verified, real historical moment, which reject was never meant
-- to do (the whole point, per the route's own comment, is removing an
-- unverified, never-shown-to-anyone submission).
create policy "moments: coaches can delete their team's pending moments"
  on moments for delete
  using (
    verified_at is null
    and exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
  );
