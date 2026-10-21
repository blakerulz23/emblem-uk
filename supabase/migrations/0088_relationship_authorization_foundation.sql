-- Relationship authorization, step 1 of 2: additive foundation.
--
-- Adds what the staff-approved coach model needs, and attribution for every
-- future guardian/coach relationship change. It removes, narrows or
-- re-scopes NO existing policy, grant or function behaviour: every current
-- read and write path keeps working exactly as before. The restrictive half
-- is 0089, which only applies once the compatible application is live.
--
--   1. coach_team: creation, expiry and ending columns.
--   2. guardians: creation columns.
--      Existing rows keep NULL in every new column. There is no record of
--      when or by whom they were created, so none is invented. Defaults are
--      set after the columns exist, so legacy rows are not stamped with this
--      migration's time. A legacy coach row (no end, no expiry) is active.
--   3. coach_assignment_is_active(ended_at, expires_at): the single
--      definition of an active assignment. Nothing uses it for access yet.
--   4. coach_team_requests: a coach asks staff for a team; at most one
--      pending request per person; decided requests are final.
--   5. relationship_audit_events + trigger on coach_team, guardians and
--      coach_players (direct coach links; removed only via
--      remove_direct_coach_link, which records the actor and reason):
--      append-only, records the initiating account or named trusted
--      operation, not just the database role (see "Attribution" below).
--   6. Staff-only functions (service_role): approve/reject a request, end an
--      assignment. Requester function (authenticated): cancel own pending
--      request.
--   7. is_authorized_coach_for_player / is_guardian_of_team_player:
--      search_path = '' with schema-qualified names. Same result, same
--      grants (CREATE OR REPLACE keeps the existing ACL).
--   8. Trusted writes for the application (service_role only), because
--      service_role holds no INSERT/UPDATE on profiles and no UPDATE on
--      coach_team (0037), and 0089 removes the signed-in user's:
--        ensure_profile_role: create the profile if missing, set the role
--          only when it is empty, never overwrite one;
--        activate_coach_assignment: insert, or reactivate an ended/expired
--          assignment, attributed to the initiating account.
--   9. staff_notification_outbox: event type 'new_coach_team_request'
--      (the existing list plus one; nothing removed).
--  10. release_readiness_confirmations: an append-only record that a staff
--      member confirmed the compatible application is deployed and its
--      smoke checks passed, for contract 'authorization_relationships_v1'.
--      Written only by confirm_release_readiness (service_role), which the
--      compatible app's staff endpoint calls. 0089 will refuse to run
--      without it. Holds no child, player, parent or coach data.
--  11. coach_players.created_by ON DELETE SET NULL, and coach_invites.created_by
--      nullable, so a guardian who created a coach invite or direct link
--      can delete their account (the invite and link remain).
--
-- Attribution. The audit trigger resolves the actor in this order:
--   trusted_function  a SECURITY DEFINER function in this file set
--                     emblem.trusted_operation / emblem.actor_profile_id
--                     for its own transaction, naming the staff member;
--   session           auth.uid() of the signed-in caller;
--   row_attribution   the row's own created_by (insert) or ended_by (end),
--                     for service-role writes that carry the real account;
--   unattributed      none of the above (recorded, never guessed).
-- The raw auth.uid() and the database role are always stored as well.
--
-- New tables and functions carry explicit grants only: production's default
-- privileges give anon/authenticated TRUNCATE, REFERENCES, TRIGGER and
-- MAINTAIN on new tables, and new functions are executable by PUBLIC.
begin;

-- ---------------------------------------------------------------------------
-- 1. coach_team
-- ---------------------------------------------------------------------------
alter table public.coach_team
  add column created_at timestamptz,
  add column created_via text,
  add column created_by uuid references public.profiles (id) on delete set null,
  add column expires_at timestamptz,
  add column ended_at timestamptz,
  add column ended_by uuid references public.profiles (id) on delete set null,
  add column end_reason text;

alter table public.coach_team alter column created_at set default now();

alter table public.coach_team
  add constraint coach_team_created_via_check
    check (created_via is null or created_via in ('team_invite', 'staff_team_request', 'staff', 'legacy')),
  add constraint coach_team_expiry_after_creation_check
    check (expires_at is null or created_at is null or expires_at > created_at),
  add constraint coach_team_ended_fields_check
    check (ended_at is not null or (ended_by is null and end_reason is null)),
  add constraint coach_team_end_reason_length_check
    check (end_reason is null or char_length(end_reason) between 1 and 500);

comment on column public.coach_team.created_at is 'NULL = legacy row created before 0088; its creation time is unknown.';
comment on column public.coach_team.expires_at is 'NULL = no expiry. Access ends at this time once 0089 applies.';
comment on column public.coach_team.ended_at is 'Set by end_coach_assignment. The row is kept for history, never deleted.';

-- ---------------------------------------------------------------------------
-- 2. guardians
-- ---------------------------------------------------------------------------
alter table public.guardians
  add column created_at timestamptz,
  add column created_via text,
  add column created_by uuid references public.profiles (id) on delete set null;

alter table public.guardians alter column created_at set default now();

alter table public.guardians
  add constraint guardians_created_via_check
    check (created_via is null or created_via in ('card_claim', 'guardian_invite', 'staff', 'legacy'));

comment on column public.guardians.created_at is 'NULL = legacy row created before 0088; its creation time is unknown.';

-- ---------------------------------------------------------------------------
-- 3. Active-assignment rule
-- ---------------------------------------------------------------------------
create function public.coach_assignment_is_active(p_ended_at timestamptz, p_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_ended_at is null and (p_expires_at is null or p_expires_at > now());
$$;
alter function public.coach_assignment_is_active(timestamptz, timestamptz) owner to postgres;
revoke all on function public.coach_assignment_is_active(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.coach_assignment_is_active(timestamptz, timestamptz) to service_role;
comment on function public.coach_assignment_is_active(timestamptz, timestamptz) is
  'The one definition of an active coach assignment: not ended, and not past its expiry. Legacy rows (both NULL) are active.';

-- ---------------------------------------------------------------------------
-- 4. coach_team_requests
-- ---------------------------------------------------------------------------
create table public.coach_team_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  club_name text not null check (char_length(btrim(club_name)) between 2 and 120),
  team_name text not null check (char_length(btrim(team_name)) between 1 and 120),
  age_group text check (age_group is null or char_length(btrim(age_group)) between 1 and 40),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) between 1 and 1000),
  resulting_team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint coach_team_requests_decision_time_check check ((status = 'pending') = (decided_at is null)),
  constraint coach_team_requests_pending_undecided_check
    check (status <> 'pending' or (decided_by is null and decision_note is null and resulting_team_id is null)),
  constraint coach_team_requests_team_only_when_approved_check check (status = 'approved' or resulting_team_id is null)
);

create unique index coach_team_requests_one_pending_per_requester
  on public.coach_team_requests (requester_profile_id) where status = 'pending';
create index coach_team_requests_status_created_idx on public.coach_team_requests (status, created_at);

comment on table public.coach_team_requests is
  'A signed-in person asks staff to make them coach of a team. Staff approve (creating or choosing the team) or reject. At most one pending request per person; a decided or cancelled request is final.';

create function public.enforce_coach_team_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.requester_profile_id <> old.requester_profile_id
     or new.created_at <> old.created_at
     or new.club_name <> old.club_name
     or new.team_name <> old.team_name
     or new.age_group is distinct from old.age_group
     or new.note is distinct from old.note then
    raise exception 'A team request''s submitted details cannot change';
  end if;
  if old.status <> 'pending' then
    raise exception 'This team request is already %, and cannot change', old.status;
  end if;
  return new;
end;
$$;
alter function public.enforce_coach_team_request_transition() owner to postgres;
revoke all on function public.enforce_coach_team_request_transition() from public, anon, authenticated;

create trigger coach_team_requests_transition
  before update on public.coach_team_requests
  for each row execute function public.enforce_coach_team_request_transition();

alter table public.coach_team_requests enable row level security;

create policy "coach_team_requests: requester can view own"
  on public.coach_team_requests for select
  using (requester_profile_id = auth.uid());

create policy "coach_team_requests: requester can submit own pending"
  on public.coach_team_requests for insert
  with check (
    requester_profile_id = auth.uid()
    and status = 'pending'
    and decided_by is null and decided_at is null and decision_note is null and resulting_team_id is null
  );

revoke all on public.coach_team_requests from public, anon, authenticated, service_role;
grant select on public.coach_team_requests to authenticated;
grant insert (club_name, team_name, age_group, note) on public.coach_team_requests to authenticated;
grant select, insert, update, delete on public.coach_team_requests to service_role;

-- ---------------------------------------------------------------------------
-- 5. relationship_audit_events
-- ---------------------------------------------------------------------------
create table public.relationship_audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  table_name text not null check (table_name in ('coach_team', 'guardians', 'coach_players')),
  event text not null check (event in ('INSERT', 'UPDATE', 'DELETE')),
  -- No foreign keys: history must outlive the rows and profiles it names.
  team_id uuid,
  player_id uuid,
  profile_id uuid not null,
  actor_profile_id uuid,
  actor_source text not null check (actor_source in ('trusted_function', 'session', 'row_attribution', 'unattributed')),
  operation text,
  -- The reason a trusted operation gave (e.g. why a direct link was removed).
  reason text check (reason is null or char_length(reason) <= 500),
  auth_uid uuid,
  db_role text not null,
  old_row jsonb,
  new_row jsonb
);

create index relationship_audit_events_profile_idx on public.relationship_audit_events (profile_id, occurred_at);

comment on table public.relationship_audit_events is
  'Append-only record of every insert, update and delete on coach_team, guardians and coach_players from 0088 onwards. Rows before 0088 have no history. Service-role read only.';

create function public.reject_relationship_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'relationship_audit_events is append-only';
end;
$$;
alter function public.reject_relationship_audit_mutation() owner to postgres;
revoke all on function public.reject_relationship_audit_mutation() from public, anon, authenticated;

create trigger relationship_audit_events_append_only
  before update or delete on public.relationship_audit_events
  for each row execute function public.reject_relationship_audit_mutation();
create trigger relationship_audit_events_no_truncate
  before truncate on public.relationship_audit_events
  for each statement execute function public.reject_relationship_audit_mutation();

alter table public.relationship_audit_events enable row level security;
-- No policies: service-role only.
revoke all on public.relationship_audit_events from public, anon, authenticated, service_role;
grant select on public.relationship_audit_events to service_role;

create function public.record_relationship_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_operation text := nullif(current_setting('emblem.trusted_operation', true), '');
  v_trusted_actor uuid := nullif(current_setting('emblem.actor_profile_id', true), '')::uuid;
  v_auth_uid uuid := auth.uid();
  v_row_actor uuid;
  v_actor uuid;
  v_source text;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_row_actor := (v_row ->> 'created_by')::uuid;
  elsif tg_op = 'UPDATE' and (to_jsonb(old) ->> 'ended_at') is null and (v_row ->> 'ended_at') is not null then
    v_row_actor := (v_row ->> 'ended_by')::uuid;
  end if;

  if v_operation is not null then
    v_source := 'trusted_function';
    v_actor := v_trusted_actor;
    v_reason := nullif(current_setting('emblem.trusted_reason', true), '');
  elsif v_auth_uid is not null then
    v_source := 'session';
    v_actor := v_auth_uid;
  elsif v_row_actor is not null then
    v_source := 'row_attribution';
    v_actor := v_row_actor;
    v_operation := v_row ->> 'created_via';
  else
    v_source := 'unattributed';
  end if;

  insert into public.relationship_audit_events (
    table_name, event, team_id, player_id, profile_id,
    actor_profile_id, actor_source, operation, reason, auth_uid, db_role, old_row, new_row
  ) values (
    tg_table_name, tg_op, (v_row ->> 'team_id')::uuid, (v_row ->> 'player_id')::uuid, (v_row ->> 'profile_id')::uuid,
    v_actor, v_source, v_operation, v_reason, v_auth_uid,
    -- current_user is this function's owner here; the role GUC still holds
    -- the caller's SET ROLE (authenticated / service_role under PostgREST).
    coalesce(nullif(current_setting('role', true), 'none'), session_user),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;
alter function public.record_relationship_audit_event() owner to postgres;
revoke all on function public.record_relationship_audit_event() from public, anon, authenticated;

create trigger relationship_audit
  after insert or update or delete on public.coach_team
  for each row execute function public.record_relationship_audit_event();
create trigger relationship_audit
  after insert or update or delete on public.guardians
  for each row execute function public.record_relationship_audit_event();
-- Direct coach links (0030): created by coach-invite redemption, removed only
-- through remove_direct_coach_link below. Attached after the table already
-- holds its existing rows, so they get no invented history.
create trigger relationship_audit
  after insert or update or delete on public.coach_players
  for each row execute function public.record_relationship_audit_event();

-- ---------------------------------------------------------------------------
-- 6. Staff and requester functions
-- ---------------------------------------------------------------------------

-- Approves a pending request. Uses p_team_id when given; otherwise creates a
-- club and team from the request in p_season_id (the caller resolves the
-- season, as order approval does). Reactivates an ended assignment rather
-- than colliding on the primary key. Sets the requester's role to coach only
-- if they have no role yet: an existing role is never overwritten.
create function public.approve_coach_team_request(
  p_request_id uuid,
  p_staff_profile_id uuid,
  p_team_id uuid default null,
  p_expires_at timestamptz default null,
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.coach_team_requests%rowtype;
  v_club_id uuid;
  v_team_id uuid;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;

  select * into v_request from public.coach_team_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Team request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This team request is already %', v_request.status;
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  if p_team_id is not null then
    select id into v_team_id from public.teams where id = p_team_id;
    if v_team_id is null then
      raise exception 'Team not found';
    end if;
  else
    if p_season_id is null or not exists (select 1 from public.seasons where id = p_season_id) then
      raise exception 'A season is required to create a new team';
    end if;
    insert into public.clubs (name) values (btrim(v_request.club_name)) returning id into v_club_id;
    insert into public.teams (club_id, name, season_id)
      values (v_club_id, btrim(v_request.team_name), p_season_id)
      returning id into v_team_id;
  end if;

  perform set_config('emblem.trusted_operation', 'approve_coach_team_request', true);
  perform set_config('emblem.actor_profile_id', p_staff_profile_id::text, true);

  insert into public.coach_team (team_id, profile_id, created_at, created_via, created_by, expires_at)
  values (v_team_id, v_request.requester_profile_id, now(), 'staff_team_request', p_staff_profile_id, p_expires_at)
  on conflict (team_id, profile_id) do update
    set ended_at = null, ended_by = null, end_reason = null, expires_at = excluded.expires_at;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);

  update public.profiles set role = 'coach' where id = v_request.requester_profile_id and role is null;

  update public.coach_team_requests
    set status = 'approved', decided_by = p_staff_profile_id, decided_at = now(), resulting_team_id = v_team_id
    where id = p_request_id;

  return v_team_id;
end;
$$;
alter function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) owner to postgres;
revoke all on function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) to service_role;

create function public.reject_coach_team_request(p_request_id uuid, p_staff_profile_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  select status into v_status from public.coach_team_requests where id = p_request_id for update;
  if v_status is null then
    raise exception 'Team request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'This team request is already %', v_status;
  end if;

  update public.coach_team_requests
    set status = 'rejected', decided_by = p_staff_profile_id, decided_at = now(), decision_note = btrim(p_reason)
    where id = p_request_id;
end;
$$;
alter function public.reject_coach_team_request(uuid, uuid, text) owner to postgres;
revoke all on function public.reject_coach_team_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_coach_team_request(uuid, uuid, text) to service_role;

create function public.cancel_own_coach_team_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.coach_team_requests
    set status = 'cancelled', decided_by = auth.uid(), decided_at = now()
    where id = p_request_id and requester_profile_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'No pending team request of yours with that id';
  end if;
end;
$$;
alter function public.cancel_own_coach_team_request(uuid) owner to postgres;
revoke all on function public.cancel_own_coach_team_request(uuid) from public, anon, authenticated;
grant execute on function public.cancel_own_coach_team_request(uuid) to authenticated, service_role;

-- Ends an assignment without deleting it. Until 0089 applies, an ended row
-- still grants the same access as before; 0089 makes it stop.
create function public.end_coach_assignment(p_team_id uuid, p_profile_id uuid, p_staff_profile_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ended_at timestamptz;
  v_found boolean;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  select true, ended_at into v_found, v_ended_at
    from public.coach_team where team_id = p_team_id and profile_id = p_profile_id for update;
  if v_found is null then
    raise exception 'Coach assignment not found';
  end if;
  if v_ended_at is not null then
    raise exception 'Coach assignment already ended';
  end if;

  perform set_config('emblem.trusted_operation', 'end_coach_assignment', true);
  perform set_config('emblem.actor_profile_id', p_staff_profile_id::text, true);
  perform set_config('emblem.trusted_reason', btrim(p_reason), true);

  update public.coach_team
    set ended_at = now(), ended_by = p_staff_profile_id, end_reason = btrim(p_reason)
    where team_id = p_team_id and profile_id = p_profile_id;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);
  perform set_config('emblem.trusted_reason', '', true);
end;
$$;
alter function public.end_coach_assignment(uuid, uuid, uuid, text) owner to postgres;
revoke all on function public.end_coach_assignment(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.end_coach_assignment(uuid, uuid, uuid, text) to service_role;

-- Removes one direct coach link (coach_players, 0030). A direct link is its
-- own relationship: it never depends on a team assignment, so ending or
-- expiring the coach's team assignment, or transferring the player, leaves it
-- in place. It ends only here, and only for an actor who is the connected
-- coach, a current guardian of the player, or staff. The row is deleted (no
-- downstream table references it); the audit event keeps the history, with
-- the actor and reason. Returns 'removed', or 'not_found' when there is no
-- such link (already removed: a safe retry).
create function public.remove_direct_coach_link(
  p_player_id uuid,
  p_coach_profile_id uuid,
  p_actor_profile_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_kind text;
begin
  if p_player_id is null or p_coach_profile_id is null then
    raise exception 'A player and a coach are required';
  end if;
  if p_actor_profile_id is null then
    raise exception 'An actor is required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason (up to 500 characters) is required';
  end if;

  if p_actor_profile_id = p_coach_profile_id then
    v_actor_kind := 'coach';
  elsif exists (select 1 from public.guardians where player_id = p_player_id and profile_id = p_actor_profile_id) then
    v_actor_kind := 'guardian';
  elsif exists (select 1 from public.staff_accounts where profile_id = p_actor_profile_id) then
    v_actor_kind := 'staff';
  else
    raise exception 'Not authorized to remove this connection';
  end if;

  perform 1 from public.coach_players
    where player_id = p_player_id and profile_id = p_coach_profile_id
    for update;
  if not found then
    return 'not_found';
  end if;

  -- Transaction-local, and cleared below. If anything raises, the whole
  -- transaction (or the caller's savepoint) rolls back these settings too.
  perform set_config('emblem.trusted_operation', 'remove_direct_coach_link:' || v_actor_kind, true);
  perform set_config('emblem.actor_profile_id', p_actor_profile_id::text, true);
  perform set_config('emblem.trusted_reason', btrim(p_reason), true);

  delete from public.coach_players where player_id = p_player_id and profile_id = p_coach_profile_id;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);
  perform set_config('emblem.trusted_reason', '', true);

  return 'removed';
end;
$$;
alter function public.remove_direct_coach_link(uuid, uuid, uuid, text) owner to postgres;
revoke all on function public.remove_direct_coach_link(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_direct_coach_link(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Trusted writes for the application
-- ---------------------------------------------------------------------------

-- Returns the profile's role after the call. A role is only ever set on a
-- profile that has none: a claim never turns a coach into a parent, and an
-- invite never turns a parent into a coach. The role is a view preference;
-- access comes from guardian and coach relationships.
create function public.ensure_profile_role(p_profile_id uuid, p_role text, p_display_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_profile_id is null then
    raise exception 'A profile id is required';
  end if;
  if p_role is null or p_role not in ('parent', 'coach') then
    raise exception 'Unsupported role: %', p_role;
  end if;

  insert into public.profiles (id, role, display_name)
  values (p_profile_id, p_role, nullif(btrim(p_display_name), ''))
  on conflict (id) do update
    set role = coalesce(public.profiles.role, excluded.role),
        display_name = coalesce(excluded.display_name, public.profiles.display_name)
  returning role into v_role;

  return v_role;
end;
$$;
alter function public.ensure_profile_role(uuid, text, text) owner to postgres;
revoke all on function public.ensure_profile_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ensure_profile_role(uuid, text, text) to service_role;

-- Makes (team, profile) an active assignment. A new row records its
-- creation; an existing ended or expired row is reactivated (its unknown
-- creation details stay as they are); an already-active row is untouched.
-- Returns true when a row was created or reactivated.
create function public.activate_coach_assignment(p_team_id uuid, p_profile_id uuid, p_created_via text, p_actor_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if p_created_via is null or p_created_via not in ('team_invite', 'staff') then
    raise exception 'Unsupported created_via: %', p_created_via;
  end if;

  perform set_config('emblem.trusted_operation', 'activate_coach_assignment:' || p_created_via, true);
  perform set_config('emblem.actor_profile_id', coalesce(p_actor_profile_id::text, ''), true);

  insert into public.coach_team (team_id, profile_id, created_at, created_via, created_by)
  values (p_team_id, p_profile_id, now(), p_created_via, p_actor_profile_id)
  on conflict (team_id, profile_id) do update
    set ended_at = null, ended_by = null, end_reason = null,
        expires_at = case when public.coach_team.expires_at <= now() then null else public.coach_team.expires_at end
    where not public.coach_assignment_is_active(public.coach_team.ended_at, public.coach_team.expires_at);
  v_changed := found;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);

  return v_changed;
end;
$$;
alter function public.activate_coach_assignment(uuid, uuid, text, uuid) owner to postgres;
revoke all on function public.activate_coach_assignment(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.activate_coach_assignment(uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Staff notification for a new team request
-- ---------------------------------------------------------------------------
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
    'squad_invite_ready_to_finalise',
    'new_coach_team_request'
  ));

-- ---------------------------------------------------------------------------
-- 10. Release readiness (the precondition 0089 checks)
-- ---------------------------------------------------------------------------
create table public.release_readiness_confirmations (
  id bigint generated always as identity primary key,
  -- One row per contract, ever: confirmation is never replaced.
  contract text not null unique check (contract in ('authorization_relationships_v1')),
  -- The deployed application's git commit, from the deployment environment.
  app_commit text not null check (app_commit ~ '^[0-9a-f]{7,40}$'),
  -- The staff account that confirmed. No foreign key: the record must
  -- outlive the account. 0089 re-checks it is still staff.
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  check_card_claim boolean not null,
  check_guardian_invite boolean not null,
  check_team_invite boolean not null,
  check_coach_invite boolean not null,
  check_dual_view boolean not null,
  check_team_request_flow boolean not null,
  constraint release_readiness_all_checks_passed check (
    check_card_claim and check_guardian_invite and check_team_invite
    and check_coach_invite and check_dual_view and check_team_request_flow
  )
);

comment on table public.release_readiness_confirmations is
  'Append-only. A staff member''s confirmation that the application compatible with a database contract is deployed and its smoke checks passed. Written only by confirm_release_readiness. No child, player, parent or coach data.';

-- The confirmation time is always the database's own clock at insert.
create function public.stamp_release_readiness_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.confirmed_at := now();
  return new;
end;
$$;
alter function public.stamp_release_readiness_confirmation() owner to postgres;
revoke all on function public.stamp_release_readiness_confirmation() from public, anon, authenticated;

create function public.reject_release_readiness_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'release_readiness_confirmations is append-only';
end;
$$;
alter function public.reject_release_readiness_mutation() owner to postgres;
revoke all on function public.reject_release_readiness_mutation() from public, anon, authenticated;

create trigger release_readiness_stamp
  before insert on public.release_readiness_confirmations
  for each row execute function public.stamp_release_readiness_confirmation();
create trigger release_readiness_append_only
  before update or delete on public.release_readiness_confirmations
  for each row execute function public.reject_release_readiness_mutation();
create trigger release_readiness_no_truncate
  before truncate on public.release_readiness_confirmations
  for each statement execute function public.reject_release_readiness_mutation();

alter table public.release_readiness_confirmations enable row level security;
-- No policies. Reads: service_role only. Writes: confirm_release_readiness only.
revoke all on public.release_readiness_confirmations from public, anon, authenticated, service_role;
grant select on public.release_readiness_confirmations to service_role;

create function public.confirm_release_readiness(
  p_contract text,
  p_app_commit text,
  p_confirmed_by uuid,
  p_card_claim boolean,
  p_guardian_invite boolean,
  p_team_invite boolean,
  p_coach_invite boolean,
  p_dual_view boolean,
  p_team_request_flow boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commit text := lower(btrim(coalesce(p_app_commit, '')));
  v_confirmed_at timestamptz;
begin
  if p_contract is distinct from 'authorization_relationships_v1' then
    raise exception 'Unknown release contract: %', p_contract;
  end if;
  if p_confirmed_by is null or not exists (select 1 from public.staff_accounts where profile_id = p_confirmed_by) then
    raise exception 'Not authorized: staff only';
  end if;
  if v_commit = '' then
    raise exception 'The deployed application commit is required';
  end if;
  if v_commit !~ '^[0-9a-f]{7,40}$' then
    raise exception 'The deployed application commit must be a git commit id';
  end if;
  if not (coalesce(p_card_claim, false) and coalesce(p_guardian_invite, false) and coalesce(p_team_invite, false)
          and coalesce(p_coach_invite, false) and coalesce(p_dual_view, false) and coalesce(p_team_request_flow, false)) then
    raise exception 'Every smoke check must be confirmed as passed';
  end if;
  if exists (select 1 from public.release_readiness_confirmations where contract = p_contract) then
    raise exception 'Release readiness for % is already confirmed', p_contract;
  end if;

  insert into public.release_readiness_confirmations (
    contract, app_commit, confirmed_by,
    check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow
  ) values (
    p_contract, v_commit, p_confirmed_by,
    true, true, true, true, true, true
  )
  returning confirmed_at into v_confirmed_at;

  return v_confirmed_at;
end;
$$;
alter function public.confirm_release_readiness(text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean) owner to postgres;
revoke all on function public.confirm_release_readiness(text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.confirm_release_readiness(text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Creators who delete their account
-- ---------------------------------------------------------------------------
-- A guardian who had created a coach invite, or whose invite was redeemed,
-- could not delete their account (delete_own_guardian_account, 0076):
--   - coach_players.created_by referenced profiles with no ON DELETE rule;
--   - coach_invites.created_by is NOT NULL, yet that function sets it to
--     NULL before deleting the profile.
-- The link and the invite stay (they belong to the child's history and the
-- coach's access); only the reference to the deleted account becomes NULL.
alter table public.coach_players
  drop constraint coach_players_created_by_fkey,
  add constraint coach_players_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.coach_invites alter column created_by drop not null;

-- ---------------------------------------------------------------------------
-- 7. Existing helpers: empty search_path, same logic, same grants
-- ---------------------------------------------------------------------------
create or replace function public.is_guardian_of_team_player(check_team_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.guardians g
    join public.players p on p.id = g.player_id
    where g.profile_id = auth.uid() and p.team_id = check_team_id
  );
$$;

create or replace function public.is_authorized_coach_for_player(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    exists (
      select 1 from public.players p
      join public.coach_team ct on ct.team_id = p.team_id
      where p.id = check_player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.coach_players cp
      where cp.player_id = check_player_id and cp.profile_id = auth.uid()
    );
$$;

commit;
