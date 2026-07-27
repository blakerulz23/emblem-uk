-- Closes a confirmed privilege-escalation gap: "moments: guardians can
-- submit for their player" (0001_init.sql) validated only the
-- guardian<->player relationship, with no restriction on trust,
-- verified_at, verified_by, or verification_status. POST /api/os/moments
-- never lets a client control those fields, so nothing was exploitable
-- through the app's own UI — but a guardian bypassing that route with a
-- direct Supabase call (trivial: the anon key is already public, and the
-- guardian's own session is real) could insert a moment with
-- trust:'coach', verified_at/verified_by populated, and
-- verification_status:'coach_verified' — a fully forged Coach Verified
-- badge on their own child's moment. Confirmed empirically via a
-- SET ROLE authenticated / request.jwt.claims simulation wrapped in
-- begin/rollback against production, 2026-07-27 — the forged insert
-- returned a row before being rolled back.
--
-- Fix: narrow this one policy to require exactly the shape the real
-- guardian-submission route already produces. Does not touch the coach
-- insert policy ("moments: coaches can create recognitions for their
-- team"), the coach verify/update policy, or any other policy on this
-- table.
drop policy "moments: guardians can submit for their player" on moments;

create policy "moments: guardians can submit for their player"
  on moments for insert
  with check (
    trust = 'parent'
    and verified_at is null
    and verified_by is null
    and verification_status in ('family_memory', 'pending_verification')
    and exists (
      select 1 from guardians g
      where g.player_id = moments.player_id and g.profile_id = auth.uid()
    )
  );
