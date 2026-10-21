-- Reverses 0088_relationship_authorization_foundation.sql, returning the
-- schema to exactly its 0087 state (proven locally by
-- supabase/tests/authz/migration_0088_test.mjs, which compares the whole
-- public catalog before 0088 and after this script).
--
-- Use only after the application has been rolled back to a version that
-- doesn't use team requests, and never while 0089 is applied: roll back
-- 0089 first.
--
-- It is lossless for every pre-0088 row (coach_team and guardians keep all
-- their original columns). It permanently DISCARDS what was created since
-- 0088: team requests, relationship audit events, and the creation, expiry
-- and ending details on coach_team/guardians rows. Export them first if
-- they're needed.
begin;

drop trigger if exists relationship_audit on public.coach_team;
drop trigger if exists relationship_audit on public.guardians;

drop function if exists public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid);
drop function if exists public.reject_coach_team_request(uuid, uuid, text);
drop function if exists public.cancel_own_coach_team_request(uuid);
drop function if exists public.end_coach_assignment(uuid, uuid, uuid, text);

drop table if exists public.relationship_audit_events;
drop table if exists public.coach_team_requests;

drop function if exists public.record_relationship_audit_event();
drop function if exists public.reject_relationship_audit_mutation();
drop function if exists public.enforce_coach_team_request_transition();
drop function if exists public.coach_assignment_is_active(timestamptz, timestamptz);

alter table public.coach_team
  drop column if exists created_at,
  drop column if exists created_via,
  drop column if exists created_by,
  drop column if exists expires_at,
  drop column if exists ended_at,
  drop column if exists ended_by,
  drop column if exists end_reason;

alter table public.guardians
  drop column if exists created_at,
  drop column if exists created_via,
  drop column if exists created_by;

-- The helpers, exactly as 0006 and 0033 defined them.
create or replace function is_guardian_of_team_player(check_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from guardians g
    join players p on p.id = g.player_id
    where g.profile_id = auth.uid() and p.team_id = check_team_id
  );
$$;

create or replace function is_authorized_coach_for_player(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = check_player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = check_player_id and cp.profile_id = auth.uid()
    );
$$;

commit;
