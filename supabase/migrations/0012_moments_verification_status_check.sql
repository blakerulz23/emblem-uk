-- DB-level enforcement that verification_status can never drift from
-- verified_at/verified_by — previously correct only by convention across
-- the three writers (POST /api/os/moments, the approve branch, POST
-- /api/os/celebrate). Confirmed zero existing violations before this was
-- written (see the pre-check query run against production).
alter table moments add constraint moments_verification_status_consistency
  check (
    (verification_status = 'coach_verified' and verified_at is not null and verified_by is not null)
    or
    (verification_status in ('family_memory', 'pending_verification') and verified_at is null and verified_by is null)
  );
