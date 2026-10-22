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
-- 0088: team requests, relationship audit events, the release-readiness
-- confirmation, and the creation, expiry and ending details on
-- coach_team/guardians rows. Export them first if
-- they're needed.
begin;

-- Precondition, checked before anything changes (0088 §11).
-- coach_invites.created_by is NOT NULL at 0087. A NULL creator means a
-- guardian who created a coach invite has deleted their account since
-- 0088; the creator cannot be restored, so this rollback refuses rather
-- than invent one. Delete or reassign those invites first, deliberately.
do $$
begin
  if exists (select 1 from public.coach_invites where created_by is null) then
    raise exception 'Rollback refused: % coach invite(s) have no creator (a guardian deleted their account after 0088). 0087 requires a creator and none can be reconstructed. Resolve these rows deliberately before rolling back.',
      (select count(*) from public.coach_invites where created_by is null);
  end if;
end;
$$;

-- 0088 §11 reversed.
alter table public.coach_invites alter column created_by set not null;
alter table public.coach_players
  drop constraint coach_players_created_by_fkey,
  add constraint coach_players_created_by_fkey foreign key (created_by) references public.profiles (id);
-- coach_invites.used_by needs no precondition: it is nullable at 0087 too,
-- and 0076's delete_own_guardian_account already sets it to NULL for a
-- deleted redeemer, so "used_at set, used_by NULL" is an ordinary 0087
-- state. Nothing has to be reconstructed; used_at keeps such an invite
-- consumed in both versions.
alter table public.coach_invites
  drop constraint coach_invites_used_by_fkey,
  add constraint coach_invites_used_by_fkey foreign key (used_by) references public.profiles (id);

drop trigger if exists relationship_audit on public.coach_team;
drop trigger if exists relationship_audit on public.guardians;
drop trigger if exists relationship_audit on public.coach_players;
drop function if exists public.remove_direct_coach_link(uuid, uuid, uuid, text);

drop function if exists public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid);
drop function if exists public.reject_coach_team_request(uuid, uuid, text);
drop function if exists public.cancel_own_coach_team_request(uuid);
drop function if exists public.end_coach_assignment(uuid, uuid, uuid, text);
drop function if exists public.confirm_release_readiness(text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean);
drop table if exists public.release_readiness_confirmations;
drop function if exists public.stamp_release_readiness_confirmation();
drop function if exists public.reject_release_readiness_mutation();
drop function if exists public.redeem_coach_invite(text, uuid, text);
drop function if exists public.redeem_team_invite(text, uuid, text);
drop function if exists public.ensure_profile_role(uuid, text, text);
drop function if exists public.activate_coach_assignment(uuid, uuid, text, uuid);

-- Fails if a 'new_coach_team_request' notification exists; delete those
-- rows first (they refer to team requests this script discards anyway).
alter table public.staff_notification_outbox
  drop constraint staff_notification_outbox_event_type_check,
  add constraint staff_notification_outbox_event_type_check check (event_type in (
    'new_squad_invite_request',
    'deletion_request_filed',
    'auth_deletion_stuck',
    'new_order_pending_approval',
    'payment_verification_failed',
    'finalise_pricing_issues',
    'organiser_concern_flagged',
    'coach_card_submitted',
    'squad_invite_payments_overdue',
    'organiser_notification_failed',
    'upload_sweep_errors',
    'squad_invite_ready_to_finalise'
  ));

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
