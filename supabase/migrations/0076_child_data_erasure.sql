-- ============================================================================
-- Child-data erasure — Gate 2 deletion work package.
--
-- Builds on the existing player_deletion_requests / delete_own_guardian_
-- account infrastructure (0041-0044) rather than replacing it: that layer
-- (request filing, ownership checks, terminal-status enforcement, sole-
-- guardian vs shared-guardian split) is already correct and well-tested.
-- This migration adds the missing piece — a real, server-enforced execution
-- state machine that actually performs erasure, instead of a staff
-- attestation that a human carried it out by hand elsewhere.
--
-- Founder decisions this migration implements (see the discovery report):
--   1. Financial records: never deleted by this package; only child-
--      identifying references attached to them are stripped.
--   3. PDFs/artwork: 90-day routine retention; an approved erasure
--      overrides that window immediately for child-identifying media.
--   4/6/7. Filing a request immediately disables exposure and suspends
--      (never revokes) related cards; full erasure is staff-only,
--      database-enforced, not merely UI-gated; cancellation/rejection only
--      ever reverses what THIS request itself did.
--   8. Guardian account deletion: extended to cover every profile-
--      referencing FK, not just the original six — NOT NULL-blocked cases
--      (Squad Invite organiser/audit history, coach-authored player
--      records) cannot be silently deleted without destroying required
--      records, so they are deferred to staff review instead of erroring.
--   9. Supplier deletion status: a truthful, bounded-enum checklist, never
--      a raw child identifier.
--   12. Squad Invite: a parallel, structurally independent deletion path,
--      since squad_invite_participations has no player_id/players row at
--      all — confirmed by direct schema and source inspection.
--
-- Every new table follows the pg_default_acl lesson (0072): explicit
-- `revoke all` before granting only the intended minimum, never a bare
-- GRANT alone. Every new RPC: SECURITY DEFINER, empty search_path, row-
-- locked, idempotent where the operation allows it — the same discipline
-- as 0075's card-lifecycle RPCs.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — cards: widen the existing reason enum to include a deletion-
-- request-specific value, so a suspension caused by a deletion request is
-- distinguishable from one caused by anything else. Purely additive — every
-- existing allowed value stays allowed.
-- ----------------------------------------------------------------------------
alter table public.cards drop constraint cards_access_status_reason_valid;
alter table public.cards add constraint cards_access_status_reason_valid
  check (access_status_reason is null or access_status_reason in
    ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other', 'deletion_request'));

-- player_deletion_requests.player_id -> players.id was ON DELETE CASCADE
-- (0041) — correct when deletion happened entirely outside any code path
-- that also touches the request row, which was true of the old manual
-- runbook. It is actively wrong now: confirm_player_deletion_erasure
-- (Part 7) deletes the player row and THEN needs to keep using — and
-- later complete — this exact request row as the erasure's own audit
-- trail (execution_state, completed_by, completion_note). A CASCADE would
-- delete the request row itself the instant the player is deleted,
-- destroying the very record decision requirement #17 (minimal deletion
-- audit) needs to survive. Discovered by actually running the erasure
-- against real staging data and hitting a foreign-key violation on the
-- storage-objects insert immediately after the player delete — not
-- guessed. SET NULL is exactly what "player_id set null, row otherwise
-- kept" already means for cards/card_definitions in the original runbook
-- — the same pattern, applied to the one table that wasn't using it yet.
-- player_id was also NOT NULL (0041) — SET NULL on delete requires the
-- column to actually allow null, so both change together.
alter table public.player_deletion_requests alter column player_id drop not null;
alter table public.player_deletion_requests drop constraint player_deletion_requests_player_id_fkey;
alter table public.player_deletion_requests add constraint player_deletion_requests_player_id_fkey
  foreign key (player_id) references public.players(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Part 2 — player_deletion_requests: add the granular execution state
-- machine. `status` (pending/completed/rejected/cancelled) keeps its
-- existing meaning as the outer guardian/staff-facing lifecycle;
-- `execution_state` tracks progress of the actual erasure once staff
-- begins executing it. Both axes exist for the same reason cards.status
-- and cards.access_status are separate: different concerns, independent
-- columns, exactly the pattern this codebase already uses everywhere else.
-- ----------------------------------------------------------------------------
alter table public.player_deletion_requests
  add column execution_state text not null default 'requested' check (execution_state in (
    'requested', 'exposure_disabled', 'awaiting_staff_confirmation', 'deleting',
    'awaiting_supplier_action', 'completed', 'failed'
  )),
  add column execution_failed_reason text,
  add column exposure_was_enabled boolean,
  add column exposure_disabled_at timestamptz,
  add column erasure_started_at timestamptz,
  add column erasure_completed_at timestamptz;

comment on column public.player_deletion_requests.execution_state is
  'Granular progress of the actual erasure, independent from status. Advanced only by request_player_deletion (requested->exposure_disabled), confirm_player_deletion_erasure (->deleting), and the staff route that reconciles storage/supplier results (->awaiting_supplier_action/completed/failed). Never advanced by a bare UPDATE from application code outside those paths.';
comment on column public.player_deletion_requests.exposure_was_enabled is
  'Whether players.public_id_enabled was true immediately before this request disabled it — read back on cancel/reject so restoration only re-enables sharing this request itself turned off, never sharing that was already off for an unrelated reason.';

-- Records exactly which cards THIS request suspended, and their state
-- immediately before — the only way to satisfy "restore only what this
-- request suspended, never a card suspended for another reason" precisely.
create table public.player_deletion_request_suspended_cards (
  request_id uuid not null references public.player_deletion_requests(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  primary key (request_id, card_id)
);

alter table public.player_deletion_request_suspended_cards enable row level security;
revoke all on public.player_deletion_request_suspended_cards from public, anon, authenticated, service_role;
grant select on public.player_deletion_request_suspended_cards to service_role;
-- Insert/delete happen only inside the SECURITY DEFINER RPCs below, which
-- run as the owning role and bypass RLS — matching every other append-
-- style table in this codebase (card_access_audit_events, 0075).

-- Server-side inventory of exactly which storage objects an approved
-- erasure must remove, populated by confirm_player_deletion_erasure BEFORE
-- the player row (and therefore the keys' only DB pointers) is deleted.
-- The Node layer can never invent or accept a client-supplied key — it may
-- only report the outcome for a key this table already names.
create table public.player_deletion_storage_objects (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.player_deletion_requests(id) on delete cascade,
  s3_key text not null,
  kind text not null check (kind in ('player_photo', 'moment_media', 'card_artwork', 'print_pdf', 'other')),
  status text not null default 'pending' check (status in ('pending', 'deleted', 'failed')),
  last_error text,
  attempts int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, s3_key)
);

alter table public.player_deletion_storage_objects enable row level security;
revoke all on public.player_deletion_storage_objects from public, anon, authenticated, service_role;
grant select, insert, update on public.player_deletion_storage_objects to service_role;
comment on table public.player_deletion_storage_objects is
  'Database and S3 are separate systems — this table is the truthful reconciliation record between them. A row starts pending the moment confirm_player_deletion_erasure names it; the staff execute route then performs the real S3 delete and updates status/last_error/attempts here. Never delete a row from this table — a failed-then-retried object keeps its history.';

-- Truthful, bounded, never-a-raw-identifier per-supplier deletion status.
create table public.player_deletion_supplier_status (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.player_deletion_requests(id) on delete cascade,
  supplier text not null check (supplier in ('shopify', 'resend', 'printer', 'courier', 'google_gemini', 'aws_s3', 'supabase', 'vercel')),
  status text not null default 'unresolved' check (status in (
    'not_applicable', 'request_required', 'requested_with_date', 'confirmed_deleted', 'expires_under_retention', 'unresolved'
  )),
  requested_at timestamptz,
  expires_at timestamptz,
  note text check (note is null or length(note) <= 500),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (request_id, supplier)
);

alter table public.player_deletion_supplier_status enable row level security;
revoke all on public.player_deletion_supplier_status from public, anon, authenticated, service_role;
grant select, insert, update on public.player_deletion_supplier_status to service_role;
comment on table public.player_deletion_supplier_status is
  'note is an operational field for staff — must never contain a child''s name, photo reference, raw storage key, or any other identifying detail, only supplier-process status. Not enforced by a content check (infeasible in SQL); enforced by staff process and the route''s own validation.';

-- ----------------------------------------------------------------------------
-- Part 3 — pending_profile_deletions: the NOT-NULL-FK-blocked case for
-- guardian account deletion. profiles.id references auth.users.id ON
-- DELETE CASCADE (confirmed via live catalog inspection) — deleting the
-- Auth identity always cascades to profiles, and that cascade fails
-- outright if any NOT-NULL column still references this profile (e.g. a
-- Squad Invite campaign's own organiser_profile_id, or a coach-authored
-- player_assessments.created_by). Nulling is impossible for a NOT NULL
-- column, and deleting the referencing row would destroy a required
-- campaign/financial/audit record — exactly what decision #8 forbids. The
-- only safe outcome is deferring identity deletion for staff review,
-- mirroring pending_auth_deletions' existing shape for a different (but
-- structurally identical) reason.
-- ----------------------------------------------------------------------------
create table public.pending_profile_deletions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text,
  -- A closed set of non-identifying reason codes, never a raw table/column
  -- name concatenation or free text describing the actual blocking data.
  blocking_reason text not null check (blocking_reason in (
    'squad_invite_organiser_history', 'squad_invite_audit_history', 'coach_authored_player_records'
  )),
  first_detected_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz
);

alter table public.pending_profile_deletions enable row level security;
revoke all on public.pending_profile_deletions from public, anon, authenticated;
grant select, insert, update on public.pending_profile_deletions to service_role;

-- ----------------------------------------------------------------------------
-- Part 4 — Squad Invite participation erasure: structurally independent
-- from player_deletion_requests, since squad_invite_participations has no
-- player_id/players row at all.
-- ----------------------------------------------------------------------------
alter table public.squad_invite_participations
  add column child_data_erased_at timestamptz;
comment on column public.squad_invite_participations.child_data_erased_at is
  'Set once display_first_name/display_surname_initial/squad_number and this participation''s storage assets have been erased. The row itself is kept (never deleted) so campaign counts, payment totals, and fulfilment aggregates stay correct — this is an anonymisation marker, not a soft-delete flag.';

create table public.squad_invite_participation_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.squad_invite_participations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  requester_email text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  notes text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completion_note text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  rejection_reason text,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  constraint sipdr_completion_requires_attestation check (
    status <> 'completed'
    or (completed_by is not null and completed_at is not null and completion_note is not null and length(trim(completion_note)) > 0)
  ),
  constraint sipdr_rejection_requires_reason check (
    status <> 'rejected'
    or (handled_by is not null and handled_at is not null and rejection_reason is not null and length(trim(rejection_reason)) > 0)
  ),
  constraint sipdr_cancellation_requires_actor check (
    status <> 'cancelled'
    or (cancelled_by is not null and cancelled_at is not null)
  )
);

alter table public.squad_invite_participation_deletion_requests enable row level security;

create policy "squad_invite_participation_deletion_requests: guardian can view their own requests"
  on public.squad_invite_participation_deletion_requests for select
  using (
    exists (
      select 1 from public.squad_invite_participations p
      where p.id = squad_invite_participation_deletion_requests.participation_id
      and p.guardian_profile_id = auth.uid()
    )
  );

grant select on public.squad_invite_participation_deletion_requests to authenticated;
grant select, update on public.squad_invite_participation_deletion_requests to service_role;
-- No insert/delete grant for authenticated — writes only through
-- request_squad_invite_participation_deletion / cancel_own_squad_invite_
-- participation_deletion_request below. No insert grant for service_role
-- either — staff routes never file a request on a guardian's behalf in
-- this pass; only the RPC does.

create index idx_squad_invite_participation_deletion_requests_participation
  on public.squad_invite_participation_deletion_requests (participation_id, status);

create table public.squad_invite_participation_deletion_storage_objects (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.squad_invite_participation_deletion_requests(id) on delete cascade,
  s3_key text not null,
  -- player_photo/moment_media/card_artwork occur when this participation
  -- already committed into a real player (erase_player_and_related_data,
  -- Part 5) — the same vocabulary the player-deletion path uses, kept
  -- consistent rather than remapped to a generic 'other'.
  kind text not null check (kind in ('participation_photo', 'player_photo', 'moment_media', 'card_artwork', 'other')),
  status text not null default 'pending' check (status in ('pending', 'deleted', 'failed')),
  last_error text,
  attempts int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, s3_key)
);

alter table public.squad_invite_participation_deletion_storage_objects enable row level security;
revoke all on public.squad_invite_participation_deletion_storage_objects from public, anon, authenticated, service_role;
grant select, insert, update on public.squad_invite_participation_deletion_storage_objects to service_role;

-- Same terminal-status enforcement as player_deletion_requests (0041),
-- reused verbatim for the Squad Invite table.
create or replace function public.enforce_squad_invite_participation_deletion_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.status in ('completed', 'rejected', 'cancelled') and NEW.status is distinct from OLD.status then
    raise exception 'Cannot change the status of a % request', OLD.status;
  end if;
  return NEW;
end;
$$;

create trigger squad_invite_participation_deletion_requests_enforce_transition
  before update on public.squad_invite_participation_deletion_requests
  for each row execute function public.enforce_squad_invite_participation_deletion_request_transition();

-- ----------------------------------------------------------------------------
-- Part 5 — shared internal lockdown helper. Not directly callable by any
-- client role (no grant to authenticated) — only invoked from within
-- request_player_deletion and delete_own_guardian_account's own
-- SECURITY DEFINER bodies below, at a point where auth.uid() still has a
-- live `guardians` row for this player, so suspend_card's own guardian
-- check passes exactly as it would for a direct guardian call.
-- ----------------------------------------------------------------------------
create function public.lockdown_for_player_deletion_request(p_request_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_enabled boolean;
  v_card record;
begin
  select public_id_enabled into v_was_enabled from public.players where id = p_player_id for update;
  update public.players set public_id_enabled = false where id = p_player_id;

  update public.player_deletion_requests
  set exposure_was_enabled = coalesce(v_was_enabled, false),
      exposure_disabled_at = now(),
      execution_state = 'awaiting_staff_confirmation'
  where id = p_request_id;

  for v_card in select id from public.cards where player_id = p_player_id and access_status is null loop
    perform public.suspend_card(v_card.id, 'deletion_request');
    insert into public.player_deletion_request_suspended_cards (request_id, card_id)
    values (p_request_id, v_card.id)
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.lockdown_for_player_deletion_request(uuid, uuid) from public, anon, authenticated;

-- Shared restore helper — the exact inverse, called from both
-- cancel_own_player_deletion_request (guardian) and
-- staff_reject_player_deletion_request (staff) below.
create function public.restore_after_player_deletion_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_suspended record;
  v_card record;
begin
  select * into v_request from public.player_deletion_requests where id = p_request_id;
  if v_request.id is null then
    return;
  end if;

  if v_request.exposure_was_enabled then
    update public.players set public_id_enabled = true where id = v_request.player_id;
  end if;

  for v_suspended in select card_id from public.player_deletion_request_suspended_cards where request_id = p_request_id loop
    select * into v_card from public.cards where id = v_suspended.card_id for update;
    -- Only reverse a card that is STILL suspended for exactly the reason
    -- this request caused — never touch one that something else has since
    -- suspended-for-another-reason, revoked, or replaced.
    if v_card.id is not null and v_card.access_status = 'suspended' and v_card.access_status_reason = 'deletion_request' then
      perform public.unsuspend_card(v_card.id);
    end if;
  end loop;
end;
$$;

revoke all on function public.restore_after_player_deletion_request(uuid) from public, anon, authenticated;

-- Shared DB-erasure core, called from both confirm_player_deletion_erasure
-- (Part 7) and confirm_squad_invite_participation_erasure (Part 8) — a
-- Squad Invite commitment creates a REAL players/cards/card_definitions
-- row set (commit_squad_invite_participation_order, migration 0055,
-- confirmed by direct inspection: `insert into public.players`/`cards`/
-- `card_definitions`), reachable only indirectly (squad_invite_
-- participations has no player_id column; the link is participations.
-- order_id -> cards.order_id -> cards.player_id). A committed
-- participation's erasure must do everything a direct player erasure
-- does, not just null its own denormalised display fields — this
-- function is that one, single, tested code path for "erase everything
-- reachable from this player_id", shared by both entry points rather
-- than duplicated.
create function public.erase_player_and_related_data(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_card record;
  v_inventory jsonb := '[]'::jsonb;
begin
  perform 1 from public.players where id = p_player_id for update;

  select photo_key into v_key from public.players where id = p_player_id;
  if v_key is not null then
    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object('s3Key', v_key, 'kind', 'player_photo'));
  end if;

  for v_key in
    select mm.s3_key from public.moment_media mm join public.moments m on m.id = mm.moment_id where m.player_id = p_player_id
  loop
    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object('s3Key', v_key, 'kind', 'moment_media'));
  end loop;

  for v_key in
    select cd.photo ->> 'storageKey' from public.card_definitions cd
    where cd.player_id = p_player_id and cd.photo ->> 'storageKey' is not null
  loop
    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object('s3Key', v_key, 'kind', 'card_artwork'));
  end loop;
  update public.card_definitions set photo = null where player_id = p_player_id;

  for v_card in
    select id from public.cards where player_id = p_player_id
    union
    select c2.id from public.cards c1 join public.cards c2 on c2.replaced_by_card_id = c1.id where c1.player_id = p_player_id
  loop
    perform public.revoke_card(v_card.id, 'deletion_request');
  end loop;

  delete from public.moment_media where moment_id in (select id from public.moments where player_id = p_player_id);
  delete from public.players where id = p_player_id;

  return v_inventory;
end;
$$;

revoke all on function public.erase_player_and_related_data(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Part 6 — request_player_deletion / cancel_own_player_deletion_request:
-- replace the 0041/0044 versions to add the immediate lockdown and its
-- exact-reverse restore. Signatures unchanged — no application call site
-- needs to change.
-- ----------------------------------------------------------------------------
create or replace function public.request_player_deletion(p_player_id uuid, p_requester_email text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the player row first so two concurrent requests for the same
  -- child can never both pass the "no pending request exists" check below.
  perform 1 from public.players where id = p_player_id for update;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to request deletion for this player';
  end if;

  select id into v_request_id
  from public.player_deletion_requests
  where player_id = p_player_id and status = 'pending'
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.player_deletion_requests (player_id, requested_by, requester_email, notes)
  values (p_player_id, auth.uid(), p_requester_email, p_notes)
  returning id into v_request_id;

  perform public.lockdown_for_player_deletion_request(v_request_id, p_player_id);

  return v_request_id;
end;
$$;

revoke all on function public.request_player_deletion(uuid, text, text) from public, anon;
grant execute on function public.request_player_deletion(uuid, text, text) to authenticated;

create or replace function public.cancel_own_player_deletion_request(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to cancel a deletion request for this player';
  end if;

  select id, status into v_request_id, v_status
  from public.player_deletion_requests
  where player_id = p_player_id
  order by requested_at desc
  limit 1;

  if v_request_id is null or v_status not in ('pending', 'cancelled') then
    raise exception 'No cancellable deletion request found for this player';
  end if;

  if v_status = 'cancelled' then
    return true;
  end if;

  update public.player_deletion_requests
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_request_id;

  perform public.restore_after_player_deletion_request(v_request_id);

  return true;
end;
$$;

revoke all on function public.cancel_own_player_deletion_request(uuid) from public, anon;
grant execute on function public.cancel_own_player_deletion_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 7 — staff-facing reject and the two-phase erasure execution.
-- ----------------------------------------------------------------------------
create function public.staff_reject_player_deletion_request(p_request_id uuid, p_rejection_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;
  if p_rejection_reason is null or length(trim(p_rejection_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;

  select status into v_status from public.player_deletion_requests where id = p_request_id for update;
  if v_status is null then
    raise exception 'Request not found';
  end if;
  if v_status = 'rejected' then
    return;
  end if;
  if v_status <> 'pending' then
    raise exception 'This request is % and can no longer be rejected', v_status;
  end if;

  update public.player_deletion_requests
  set status = 'rejected', handled_by = auth.uid(), handled_at = now(), rejection_reason = p_rejection_reason
  where id = p_request_id;

  perform public.restore_after_player_deletion_request(p_request_id);
end;
$$;

revoke all on function public.staff_reject_player_deletion_request(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_reject_player_deletion_request(uuid, text) to authenticated;

-- Phase A: staff-triggered, performs every DB-side erasure step and
-- inventories every storage object that must be removed — but does NOT
-- itself mark the request completed, since S3 deletion (a separate system)
-- hasn't happened yet. Returns the inventory so the calling route knows
-- exactly what to delete; it can never be told to delete anything else.
create function public.confirm_player_deletion_erasure(p_request_id uuid, p_completion_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_player_id uuid;
  v_item jsonb;
  v_inventory jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;
  if p_completion_note is null or length(trim(p_completion_note)) = 0 then
    raise exception 'A completion note is required';
  end if;

  select * into v_request from public.player_deletion_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if v_request.status = 'completed' then
    return jsonb_build_object('alreadyCompleted', true, 'inventory', '[]'::jsonb);
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request is % and can no longer be executed', v_request.status;
  end if;
  if v_request.erasure_started_at is not null then
    -- Erasure already ran once (e.g. a prior attempt got interrupted
    -- before storage cleanup finished) — the player row and its cascades
    -- are already gone, so re-running erase_player_and_related_data would
    -- error on a missing row. Re-derive the existing inventory instead of
    -- re-deriving keys from data that no longer exists.
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 's3Key', s3_key, 'kind', kind)), '[]'::jsonb)
    into v_inventory
    from public.player_deletion_storage_objects
    where request_id = p_request_id and status <> 'deleted';
    return jsonb_build_object('alreadyCompleted', false, 'resumed', true, 'inventory', v_inventory);
  end if;

  v_player_id := v_request.player_id;

  update public.player_deletion_requests
  set execution_state = 'deleting', erasure_started_at = now(), completed_by = auth.uid(), completion_note = p_completion_note
  where id = p_request_id;

  for v_item in select jsonb_array_elements(public.erase_player_and_related_data(v_player_id)) loop
    insert into public.player_deletion_storage_objects (request_id, s3_key, kind)
    values (p_request_id, v_item ->> 's3Key', v_item ->> 'kind')
    on conflict do nothing;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 's3Key', s3_key, 'kind', kind)), '[]'::jsonb)
  into v_inventory
  from public.player_deletion_storage_objects
  where request_id = p_request_id;

  return jsonb_build_object('alreadyCompleted', false, 'resumed', false, 'inventory', v_inventory);
end;
$$;

revoke all on function public.confirm_player_deletion_erasure(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_player_deletion_erasure(uuid, text) to authenticated;

-- Phase B: called after the route has attempted every inventoried S3
-- object. Only ever moves the outer status to 'completed' once storage is
-- genuinely fully deleted and no supplier item is left unresolved —
-- otherwise reports back exactly what's still outstanding, truthfully.
create function public.finalize_player_deletion_erasure(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_pending_objects int;
  v_failed_objects int;
  v_blocking_suppliers int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  select status into v_status from public.player_deletion_requests where id = p_request_id for update;
  if v_status is null then
    raise exception 'Request not found';
  end if;
  if v_status = 'completed' then
    return jsonb_build_object('completed', true);
  end if;
  if v_status <> 'pending' then
    raise exception 'This request is %', v_status;
  end if;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'failed')
  into v_pending_objects, v_failed_objects
  from public.player_deletion_storage_objects where request_id = p_request_id;

  select count(*) into v_blocking_suppliers
  from public.player_deletion_supplier_status
  where request_id = p_request_id and status in ('unresolved', 'request_required', 'requested_with_date');

  if coalesce(v_failed_objects, 0) > 0 then
    update public.player_deletion_requests
    set execution_state = 'failed', execution_failed_reason = format('%s storage object(s) failed to delete', v_failed_objects)
    where id = p_request_id;
    return jsonb_build_object('completed', false, 'state', 'failed', 'pendingObjects', v_pending_objects, 'failedObjects', v_failed_objects);
  end if;

  if coalesce(v_pending_objects, 0) > 0 then
    return jsonb_build_object('completed', false, 'state', 'deleting', 'pendingObjects', v_pending_objects, 'failedObjects', 0);
  end if;

  if coalesce(v_blocking_suppliers, 0) > 0 then
    update public.player_deletion_requests set execution_state = 'awaiting_supplier_action' where id = p_request_id;
    return jsonb_build_object('completed', false, 'state', 'awaiting_supplier_action', 'blockingSuppliers', v_blocking_suppliers);
  end if;

  update public.player_deletion_requests
  set status = 'completed', execution_state = 'completed', completed_at = now(), erasure_completed_at = now()
  where id = p_request_id;

  return jsonb_build_object('completed', true);
end;
$$;

revoke all on function public.finalize_player_deletion_erasure(uuid) from public, anon, authenticated;
grant execute on function public.finalize_player_deletion_erasure(uuid) to authenticated;

-- Records one genuine S3-delete attempt for a single inventoried storage
-- object. A single UPDATE ... SET attempts = attempts + 1 is atomic under
-- Postgres' own per-row locking — no read-then-write round trip, so two
-- concurrent calls for the same object can never lose an increment. The
-- caller (the staff execute route) supplies only whether the delete
-- succeeded and, if not, the error text; it can never set attempts
-- directly, so the count always reflects genuine calls, not client input.
create function public.record_player_deletion_storage_attempt(
  p_object_id uuid,
  p_deleted boolean,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.player_deletion_storage_objects;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  update public.player_deletion_storage_objects
  set
    attempts = attempts + 1,
    status = case when p_deleted then 'deleted' else 'failed' end,
    deleted_at = case when p_deleted then now() else deleted_at end,
    last_error = case when p_deleted then null else p_error end
  where id = p_object_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Storage object not found';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;

revoke all on function public.record_player_deletion_storage_attempt(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_player_deletion_storage_attempt(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 8 — Squad Invite participation erasure. Authority is derived
-- entirely from squad_invite_participations.guardian_profile_id = auth.
-- uid() plus the specific participation row — never a client-supplied
-- participation id alone, matching the same ownership-check shape as
-- every player-deletion RPC above.
--
-- squad_invite_participations has no player_id column, but a committed
-- participation (commit_squad_invite_participation_order, migration
-- 0055) DOES create a real players/cards/card_definitions row set,
-- reachable only indirectly via participation.order_id -> cards.order_id
-- -> cards.player_id (confirmed by direct inspection of 0055's insert
-- statements — an earlier discovery pass that only grepped TypeScript
-- lib files for `player_id` missed this, since the insert happens inside
-- this SQL RPC, not application code). confirm_squad_invite_participation_
-- erasure (below) follows that link and, when present, runs the exact
-- same erase_player_and_related_data used by the player-deletion path —
-- not a lighter, separate implementation.
--
-- Filing a REQUEST, deliberately, has no immediate side effect beyond the
-- record itself — unlike the player path's decisions 4-7, decision 12
-- does not require an immediate exposure/card lockdown for Squad Invite,
-- and a not-yet-committed participation has nothing to lock down anyway
-- (no card exists until commit). Card suspension for an already-committed
-- participation happens as part of final erasure (revoke_card, inside
-- erase_player_and_related_data), the same point every other card
-- revocation in this migration happens.
-- ----------------------------------------------------------------------------
create function public.request_squad_invite_participation_deletion(p_participation_id uuid, p_requester_email text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.squad_invite_participations p
    where p.id = p_participation_id and p.guardian_profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to request deletion for this participation';
  end if;

  select id into v_request_id
  from public.squad_invite_participation_deletion_requests
  where participation_id = p_participation_id and status = 'pending'
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.squad_invite_participation_deletion_requests (participation_id, requested_by, requester_email, notes)
  values (p_participation_id, auth.uid(), p_requester_email, p_notes)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_squad_invite_participation_deletion(uuid, text, text) from public, anon;
grant execute on function public.request_squad_invite_participation_deletion(uuid, text, text) to authenticated;

create function public.cancel_own_squad_invite_participation_deletion_request(p_participation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.squad_invite_participations p
    where p.id = p_participation_id and p.guardian_profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to cancel a deletion request for this participation';
  end if;

  select id, status into v_request_id, v_status
  from public.squad_invite_participation_deletion_requests
  where participation_id = p_participation_id
  order by requested_at desc
  limit 1;

  if v_request_id is null or v_status not in ('pending', 'cancelled') then
    raise exception 'No cancellable deletion request found for this participation';
  end if;

  if v_status = 'cancelled' then
    return true;
  end if;

  update public.squad_invite_participation_deletion_requests
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_request_id;

  return true;
end;
$$;

revoke all on function public.cancel_own_squad_invite_participation_deletion_request(uuid) from public, anon;
grant execute on function public.cancel_own_squad_invite_participation_deletion_request(uuid) to authenticated;

create function public.staff_reject_squad_invite_participation_deletion_request(p_request_id uuid, p_rejection_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;
  if p_rejection_reason is null or length(trim(p_rejection_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;

  select status into v_status from public.squad_invite_participation_deletion_requests where id = p_request_id for update;
  if v_status is null then
    raise exception 'Request not found';
  end if;
  if v_status = 'rejected' then
    return;
  end if;
  if v_status <> 'pending' then
    raise exception 'This request is % and can no longer be rejected', v_status;
  end if;

  update public.squad_invite_participation_deletion_requests
  set status = 'rejected', handled_by = auth.uid(), handled_at = now(), rejection_reason = p_rejection_reason
  where id = p_request_id;
end;
$$;

revoke all on function public.staff_reject_squad_invite_participation_deletion_request(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_reject_squad_invite_participation_deletion_request(uuid, text) to authenticated;

-- Phase A: anonymises the participation's child-identifying fields and
-- inventories its storage assets (stable key + any still-outstanding
-- temp/reservation key) — never deletes the row itself, so campaign
-- counts, payment totals, and fulfilment aggregates stay exactly correct.
-- Handles every participation status (started/commitment_completed/
-- payment_*/paid/cancelled/refunded/reversed/production_accepted/
-- exception) identically — erasure is orthogonal to payment/commitment
-- progress, the same "separate axis" principle as cards.access_status.
create function public.confirm_squad_invite_participation_erasure(p_request_id uuid, p_completion_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_participation record;
  v_participation_id uuid;
  v_asset record;
  v_key text;
  v_linked_player_id uuid;
  v_item jsonb;
  v_inventory jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;
  if p_completion_note is null or length(trim(p_completion_note)) = 0 then
    raise exception 'A completion note is required';
  end if;

  select * into v_request from public.squad_invite_participation_deletion_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if v_request.status = 'completed' then
    return jsonb_build_object('alreadyCompleted', true, 'inventory', '[]'::jsonb);
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request is % and can no longer be executed', v_request.status;
  end if;

  v_participation_id := v_request.participation_id;
  select * into v_participation from public.squad_invite_participations where id = v_participation_id for update;

  for v_asset in select slot_key, reservation_id from public.squad_invite_participation_assets where participation_id = v_participation_id loop
    v_key := 'order-assets/' || v_participation_id::text || '/' || v_asset.slot_key;
    insert into public.squad_invite_participation_deletion_storage_objects (request_id, s3_key, kind)
    values (p_request_id, v_key, 'participation_photo')
    on conflict do nothing;
    if v_asset.reservation_id is not null then
      insert into public.squad_invite_participation_deletion_storage_objects (request_id, s3_key, kind)
      values (p_request_id, v_key || '.pending-' || v_asset.reservation_id::text, 'participation_photo')
      on conflict do nothing;
    end if;
  end loop;

  -- squad_invite_participations has no player_id column at all — the only
  -- link to a real player/card/moment set a commitment created
  -- (commit_squad_invite_participation_order, migration 0055) is
  -- indirect: participation.order_id -> cards.order_id -> cards.player_id.
  -- A participation that never committed (still 'started', no order_id)
  -- has no such set to reach, which is exactly correct — there is nothing
  -- more to erase beyond the participation row and its own assets above.
  if v_participation.order_id is not null then
    select player_id into v_linked_player_id from public.cards where order_id = v_participation.order_id limit 1;
    if v_linked_player_id is not null then
      for v_item in select jsonb_array_elements(public.erase_player_and_related_data(v_linked_player_id)) loop
        insert into public.squad_invite_participation_deletion_storage_objects (request_id, s3_key, kind)
        values (p_request_id, v_item ->> 's3Key', v_item ->> 'kind')
        on conflict do nothing;
      end loop;
    end if;
  end if;

  update public.squad_invite_participations
  set display_first_name = null,
      display_surname_initial = null,
      squad_number = null,
      child_data_erased_at = now()
  where id = v_participation_id;

  update public.squad_invite_participation_deletion_requests
  set completed_by = auth.uid(), completion_note = p_completion_note
  where id = p_request_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 's3Key', s3_key, 'kind', kind)), '[]'::jsonb)
  into v_inventory
  from public.squad_invite_participation_deletion_storage_objects
  where request_id = p_request_id;

  return jsonb_build_object('alreadyCompleted', false, 'inventory', v_inventory);
end;
$$;

revoke all on function public.confirm_squad_invite_participation_erasure(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_squad_invite_participation_erasure(uuid, text) to authenticated;

create function public.finalize_squad_invite_participation_erasure(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_pending_objects int;
  v_failed_objects int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  select status into v_status from public.squad_invite_participation_deletion_requests where id = p_request_id for update;
  if v_status is null then
    raise exception 'Request not found';
  end if;
  if v_status = 'completed' then
    return jsonb_build_object('completed', true);
  end if;
  if v_status <> 'pending' then
    raise exception 'This request is %', v_status;
  end if;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'failed')
  into v_pending_objects, v_failed_objects
  from public.squad_invite_participation_deletion_storage_objects where request_id = p_request_id;

  if coalesce(v_failed_objects, 0) > 0 then
    return jsonb_build_object('completed', false, 'state', 'failed', 'pendingObjects', v_pending_objects, 'failedObjects', v_failed_objects);
  end if;
  if coalesce(v_pending_objects, 0) > 0 then
    return jsonb_build_object('completed', false, 'state', 'deleting', 'pendingObjects', v_pending_objects, 'failedObjects', 0);
  end if;

  update public.squad_invite_participation_deletion_requests
  set status = 'completed', completed_at = now()
  where id = p_request_id;

  return jsonb_build_object('completed', true);
end;
$$;

revoke all on function public.finalize_squad_invite_participation_erasure(uuid) from public, anon, authenticated;
grant execute on function public.finalize_squad_invite_participation_erasure(uuid) to authenticated;

-- Squad Invite counterpart to record_player_deletion_storage_attempt
-- above — same atomic single-UPDATE increment, same staff-only gate, same
-- refusal to accept a client-supplied attempts value.
create function public.record_squad_invite_deletion_storage_attempt(
  p_object_id uuid,
  p_deleted boolean,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.squad_invite_participation_deletion_storage_objects;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  update public.squad_invite_participation_deletion_storage_objects
  set
    attempts = attempts + 1,
    status = case when p_deleted then 'deleted' else 'failed' end,
    deleted_at = case when p_deleted then now() else deleted_at end,
    last_error = case when p_deleted then null else p_error end
  where id = p_object_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Storage object not found';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;

revoke all on function public.record_squad_invite_deletion_storage_attempt(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_squad_invite_deletion_storage_attempt(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 9 — delete_own_guardian_account: extended to cover every profile-
-- referencing FK found in the live catalog, not just the original six.
-- Nullable columns are nulled exactly as before. NOT-NULL columns
-- (player_assessments/goals/season_focus/strengths.created_by,
-- squad_invite_links.created_by_profile_id, squad_invite_organiser_
-- ownership.organiser_profile_id, squad_invite_request_declarations.
-- actor_profile_id, squad_invite_requests.organiser_profile_id,
-- squad_invites.organiser_profile_id) cannot be nulled, and deleting the
-- rows that hold them would destroy a required campaign/financial/audit
-- record — exactly what the founder's decision forbids. profiles.id
-- references auth.users.id ON DELETE CASCADE (confirmed live), so the
-- Auth admin API's deleteUser() call is what actually triggers the
-- profiles delete; if any NOT-NULL blocker still exists, that cascade
-- would fail outright. This function now checks first and reports
-- whether it is safe to proceed, rather than letting the route discover
-- a raw constraint-violation error.
-- ----------------------------------------------------------------------------
create or replace function public.delete_own_guardian_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_email text;
  v_player_ids uuid[];
  v_player_id uuid;
  v_other_guardians_count int;
  v_players_unlinked uuid[] := '{}';
  v_players_deletion_requested uuid[] := '{}';
  v_request_id uuid;
  v_blocked boolean;
  v_blocking_reason text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select array_agg(player_id) into v_player_ids from public.guardians where profile_id = v_uid;

  if v_player_ids is not null then
    foreach v_player_id in array v_player_ids loop
      select count(*) into v_other_guardians_count
      from public.guardians
      where player_id = v_player_id and profile_id <> v_uid;

      if v_other_guardians_count > 0 then
        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        update public.moments set uploaded_by = null where player_id = v_player_id and uploaded_by = v_uid;
        update public.coach_invites set created_by = null where player_id = v_player_id and created_by = v_uid;
        update public.coach_invites set used_by = null where player_id = v_player_id and used_by = v_uid;
        update public.player_invites set created_by = null where player_id = v_player_id and created_by = v_uid;
        update public.player_invites set used_by = null where player_id = v_player_id and used_by = v_uid;
        v_players_unlinked := v_players_unlinked || v_player_id;
      else
        select id into v_request_id
        from public.player_deletion_requests
        where player_id = v_player_id and status = 'pending'
        limit 1;

        if v_request_id is null then
          insert into public.player_deletion_requests (player_id, requested_by, requester_email, notes)
          values (v_player_id, v_uid, v_email, 'Automatic: filed because the sole guardian deleted their account')
          returning id into v_request_id;
          -- Same immediate lockdown a guardian-filed request gets — this
          -- guardian's own `guardians` row for this player still exists
          -- at this point (removed below), so suspend_card's own
          -- authorization check passes exactly as it would for a direct
          -- guardian call.
          perform public.lockdown_for_player_deletion_request(v_request_id, v_player_id);
        end if;

        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        v_players_deletion_requested := v_players_deletion_requested || v_player_id;
      end if;
    end loop;
  end if;

  -- Defense-in-depth pass, unscoped to any specific player.
  delete from public.active_viewers where profile_id = v_uid;
  delete from public.story_updates where recipient_profile_id = v_uid;
  update public.coach_invites set created_by = null where created_by = v_uid;
  update public.coach_invites set used_by = null where used_by = v_uid;
  update public.player_invites set created_by = null where created_by = v_uid;
  update public.player_invites set used_by = null where used_by = v_uid;
  update public.moments set uploaded_by = null where uploaded_by = v_uid;
  -- Newly covered nullable references (previously left untouched, which
  -- would have blocked the profiles delete via NO ACTION/RESTRICT).
  update public.moments set verified_by = null where verified_by = v_uid;
  update public.orders set approved_by = null where approved_by = v_uid;
  update public.team_invites set created_by = null where created_by = v_uid;
  update public.team_invites set used_by = null where used_by = v_uid;
  update public.squad_invite_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_link_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_notification_outbox set recipient_profile_id = null where recipient_profile_id = v_uid;
  update public.squad_invite_participations set guardian_profile_id = null where guardian_profile_id = v_uid;
  update public.squad_invite_permissions set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_request_audit_events set actor_profile_id = null where actor_profile_id = v_uid;

  -- NOT-NULL blockers: cannot be nulled, and their rows are required
  -- campaign/financial/audit records that must not be destroyed. Detect
  -- rather than attempt and fail.
  select exists (
    select 1 from public.player_assessments where created_by = v_uid
    union all select 1 from public.player_goals where created_by = v_uid
    union all select 1 from public.player_season_focus where created_by = v_uid
    union all select 1 from public.player_strengths where created_by = v_uid
  ) into v_blocked;
  if v_blocked then
    v_blocking_reason := 'coach_authored_player_records';
  else
    select exists (
      select 1 from public.squad_invite_links where created_by_profile_id = v_uid
      union all select 1 from public.squad_invite_organiser_ownership where organiser_profile_id = v_uid
      union all select 1 from public.squad_invite_requests where organiser_profile_id = v_uid
      union all select 1 from public.squad_invites where organiser_profile_id = v_uid
    ) into v_blocked;
    if v_blocked then
      v_blocking_reason := 'squad_invite_organiser_history';
    else
      select exists (
        select 1 from public.squad_invite_request_declarations where actor_profile_id = v_uid
      ) into v_blocked;
      if v_blocked then
        v_blocking_reason := 'squad_invite_audit_history';
      end if;
    end if;
  end if;

  if v_blocked then
    insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason)
    values (v_uid, v_email, v_blocking_reason)
    on conflict (auth_user_id) do update set blocking_reason = excluded.blocking_reason;
  else
    delete from public.profiles where id = v_uid;
  end if;

  return jsonb_build_object(
    'playersUnlinked', to_jsonb(v_players_unlinked),
    'playersDeletionRequested', to_jsonb(v_players_deletion_requested),
    'canDeleteIdentity', not v_blocked
  );
end;
$$;

revoke all on function public.delete_own_guardian_account() from public, anon;
grant execute on function public.delete_own_guardian_account() to authenticated;

-- ----------------------------------------------------------------------------
-- Part 10 — the one necessary, narrowly-scoped touch to migration 0075's
-- own RPCs. cards_access_status_reason_valid (the TABLE constraint, Part 1
-- above) was widened to allow 'deletion_request', but suspend_card and
-- revoke_card each carry their OWN separate, hardcoded reason allow-list
-- inside their function bodies (not derived from the table constraint) —
-- discovered only by actually calling suspend_card(..., 'deletion_request')
-- against a real database and watching it raise 'Unsupported reason:
-- deletion_request' from its own internal check. Every other line of both
-- functions is byte-identical to 0075 — only the allow-list literal
-- changes. This is exactly the "narrowly necessary deletion integration,
-- separately justified" the work package's own instructions anticipate;
-- nothing about suspend_card's or revoke_card's authorization, locking,
-- idempotency, or audit behaviour changes.
-- ----------------------------------------------------------------------------
create or replace function public.suspend_card(
  p_card_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_is_guardian boolean;
  v_is_staff boolean;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Not authorized to update this card';
  end if;

  v_is_staff := exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid());
  v_is_guardian := v_card.player_id is not null and exists (
    select 1 from public.guardians g where g.player_id = v_card.player_id and g.profile_id = auth.uid()
  );

  if not (v_is_staff or v_is_guardian) then
    raise exception 'Not authorized to update this card';
  end if;
  v_actor_role := case when v_is_staff then 'staff' else 'guardian' end;

  if p_reason is not null and p_reason not in ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other', 'deletion_request') then
    raise exception 'Unsupported reason: %', p_reason;
  end if;

  if v_card.access_status = 'revoked' then
    raise exception 'This card is permanently revoked and cannot be suspended';
  end if;

  if v_card.access_status = 'suspended' then
    -- Idempotent no-op: already suspended.
    return;
  end if;

  update public.cards
  set access_status = 'suspended',
      access_status_reason = p_reason,
      access_status_changed_at = now()
  where id = p_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id, reason)
  values (p_card_id, v_card.player_id, 'suspended', v_actor_role, auth.uid(), p_reason);
end;
$$;

revoke all on function public.suspend_card(uuid, text) from public, anon;
grant execute on function public.suspend_card(uuid, text) to authenticated;

create or replace function public.revoke_card(
  p_card_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Card not found';
  end if;

  if p_reason is not null and p_reason not in ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other', 'deletion_request') then
    raise exception 'Unsupported reason: %', p_reason;
  end if;

  if v_card.access_status = 'revoked' then
    -- Idempotent no-op: already revoked (possibly via replacement).
    return;
  end if;

  update public.cards
  set access_status = 'revoked',
      access_status_reason = p_reason,
      access_status_changed_at = now()
  where id = p_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id, reason)
  values (p_card_id, v_card.player_id, 'revoked', 'staff', auth.uid(), p_reason);
end;
$$;

revoke all on function public.revoke_card(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_card(uuid, text) to authenticated;

commit;
