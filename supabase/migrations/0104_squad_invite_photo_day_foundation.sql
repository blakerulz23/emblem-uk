-- Photo Day foundation: an optional mode of a Squad Invite in which a hired
-- photographer shoots the team on matchday and staff match each photo to a
-- participating child, so the parent receives a ready-made card.
--
-- Design: docs/architecture/photo-day-design-v0.1.md
--
-- Rules enforced here (not only in routes):
--   * A child can only be matched to a photo if their guardian has granted
--     the new 'photo_day_photography' permission and not withdrawn it.
--   * The photographer never holds a staff account: they get a time-limited
--     upload token (only its SHA-256 is stored) that can add photos to one
--     photo day and nothing else. They cannot list, read or match photos.
--   * Every photo row carries a delete-by date. Storage deletion itself is a
--     later checkpoint (cron + erasure hook); rows record deleted_at.
--
-- Additive only, apart from widening two existing check constraints.
-- Depends on 0103 (restored audit event list).

-- 1. New consent purpose -----------------------------------------------------
alter table public.squad_invite_permissions
  drop constraint squad_invite_permissions_purpose_check,
  add constraint squad_invite_permissions_purpose_check
    check (purpose in (
      'organiser_authority','child_information_authority','photograph_manufacture',
      'consolidated_delivery','payment_neutral_commitment','private_registration',
      'photo_day_photography'
    ));

-- 2. New audit event types (0103 list + photo day) ----------------------------
alter table public.squad_invite_audit_events
  drop constraint squad_invite_audit_events_event_type_check,
  add constraint squad_invite_audit_events_event_type_check
    check (event_type = any (array[
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested',
      'coach_card_submitted','coach_card_locked','coach_card_changes_requested',
      'photo_rejected',
      'campaign_reopened',
      'payment_preview_opened',
      'photo_day_scheduled','photo_day_photographer_link_issued','photo_day_photo_uploaded',
      'photo_day_photo_matched','photo_day_photo_unmatched','photo_day_status_changed',
      'photo_day_photos_deleted'
    ]));

-- 3. Photo day (one per campaign) ---------------------------------------------
create table public.squad_invite_photo_days (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.squad_invites(id) on delete cascade,
  status text not null default 'scheduled' check (status in (
    'scheduled','shooting','matching','published','closed','cancelled'
  )),
  scheduled_for date not null,
  venue_label text not null check (char_length(trim(venue_label)) between 2 and 160),
  photographer_name text not null check (char_length(trim(photographer_name)) between 2 and 120),
  photographer_token_hash text unique check (photographer_token_hash ~ '^[0-9a-f]{64}$'),
  photographer_token_expires_at timestamptz,
  -- Matchday photography also needs both coaches' permission on the day.
  coach_permissions_confirmed_at timestamptz,
  coach_permissions_note text check (char_length(coach_permissions_note) <= 300),
  max_photos integer not null default 400 check (max_photos between 1 and 1000),
  photos_delete_after timestamptz not null,
  photos_deleted_at timestamptz,
  created_by_staff_profile_id uuid not null references public.staff_accounts(profile_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_day_token_coherent check (
    (photographer_token_hash is null) = (photographer_token_expires_at is null)
  ),
  constraint photo_day_coach_permission_before_shooting check (
    status in ('scheduled','cancelled') or coach_permissions_confirmed_at is not null
  )
);

-- 4. Photos -------------------------------------------------------------------
create table public.squad_invite_photo_day_photos (
  id uuid primary key default gen_random_uuid(),
  photo_day_id uuid not null references public.squad_invite_photo_days(id) on delete cascade,
  storage_key text not null unique check (
    storage_key ~ '^photo-day/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  bytes bigint not null check (bytes between 1 and 26214400),
  uploaded_at timestamptz not null default now(),
  -- Erasing a participation removes its photo rows; the erasure flow must
  -- also delete the storage objects (later checkpoint).
  participation_id uuid references public.squad_invite_participations(id) on delete cascade,
  matched_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict,
  matched_at timestamptz,
  deleted_at timestamptz,
  constraint photo_day_photo_match_coherent check (
    (participation_id is null) = (matched_at is null)
    and (matched_at is null) = (matched_by_staff_profile_id is null)
  ),
  constraint photo_day_photo_deleted_unmatched check (deleted_at is null or participation_id is null)
);

create index squad_invite_photo_day_photos_day_idx
  on public.squad_invite_photo_day_photos(photo_day_id, uploaded_at) where deleted_at is null;
create index squad_invite_photo_day_photos_participation_idx
  on public.squad_invite_photo_day_photos(participation_id) where participation_id is not null;

alter table public.squad_invite_photo_days enable row level security;
alter table public.squad_invite_photo_day_photos enable row level security;
revoke all on public.squad_invite_photo_days, public.squad_invite_photo_day_photos
  from public, anon, authenticated;
grant select, insert, update on public.squad_invite_photo_days, public.squad_invite_photo_day_photos
  to service_role;

-- 5. Photographer upload: token-checked, count-capped, add-only ---------------
-- Called by the upload route AFTER the object is stored under storage_key.
-- Returns the photo id, or null when the token is wrong/expired, the day is
-- not accepting uploads, or the cap is reached (route must then delete the
-- stored object).
create or replace function public.record_photo_day_photo(
  p_photo_day_id uuid,
  p_token_hash text,
  p_storage_key text,
  p_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.squad_invite_photo_days%rowtype;
  v_count integer;
  v_id uuid;
begin
  select * into v_day from public.squad_invite_photo_days where id = p_photo_day_id for update;
  if not found
     or v_day.photographer_token_hash is null
     or v_day.photographer_token_hash is distinct from p_token_hash
     or v_day.photographer_token_expires_at <= now()
     or v_day.status not in ('scheduled','shooting')
     or v_day.coach_permissions_confirmed_at is null
     or v_day.photos_deleted_at is not null then
    return null;
  end if;
  if p_storage_key not like 'photo-day/' || p_photo_day_id::text || '/%' then
    return null;
  end if;
  select count(*) into v_count from public.squad_invite_photo_day_photos
  where photo_day_id = p_photo_day_id and deleted_at is null;
  if v_count >= v_day.max_photos then
    return null;
  end if;

  insert into public.squad_invite_photo_day_photos(photo_day_id, storage_key, bytes)
  values (p_photo_day_id, p_storage_key, p_bytes)
  returning id into v_id;

  if v_day.status = 'scheduled' then
    update public.squad_invite_photo_days set status = 'shooting', updated_at = now() where id = p_photo_day_id;
  end if;
  insert into public.squad_invite_audit_events(campaign_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, 'public', 'photo_day_photo_uploaded', jsonb_build_object('photoId', v_id, 'bytes', p_bytes));
  return v_id;
end;
$$;

-- 6. Staff matching: consent is checked in the same locked read ---------------
create or replace function public.match_photo_day_photo(
  p_photo_id uuid,
  p_participation_id uuid,
  p_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.squad_invite_photo_day_photos%rowtype;
  v_day public.squad_invite_photo_days%rowtype;
  v_participation public.squad_invite_participations%rowtype;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  select * into v_photo from public.squad_invite_photo_day_photos where id = p_photo_id for update;
  if not found or v_photo.deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'photo_not_found');
  end if;
  select * into v_day from public.squad_invite_photo_days where id = v_photo.photo_day_id for update;
  if v_day.status not in ('shooting','matching') then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_matching');
  end if;
  select * into v_participation from public.squad_invite_participations
  where id = p_participation_id and campaign_id = v_day.campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'participation_not_in_campaign');
  end if;
  if v_participation.status <> 'started' then
    return jsonb_build_object('ok', false, 'reason', 'participation_not_open');
  end if;
  if not exists (
    select 1 from public.squad_invite_permissions
    where campaign_id = v_day.campaign_id
      and participation_id = p_participation_id
      and purpose = 'photo_day_photography'
      and granted = true
      and withdrawn_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_photo_day_consent');
  end if;

  update public.squad_invite_photo_day_photos set
    participation_id = p_participation_id,
    matched_by_staff_profile_id = p_staff_profile_id,
    matched_at = now()
  where id = p_photo_id;
  if v_day.status = 'shooting' then
    update public.squad_invite_photo_days set status = 'matching', updated_at = now() where id = v_day.id;
  end if;
  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, p_participation_id, p_staff_profile_id, 'staff', 'photo_day_photo_matched', jsonb_build_object('photoId', p_photo_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unmatch_photo_day_photo(
  p_photo_id uuid,
  p_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.squad_invite_photo_day_photos%rowtype;
  v_campaign_id uuid;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  select * into v_photo from public.squad_invite_photo_day_photos where id = p_photo_id for update;
  if not found or v_photo.participation_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_matched');
  end if;
  select campaign_id into v_campaign_id from public.squad_invite_photo_days where id = v_photo.photo_day_id;
  update public.squad_invite_photo_day_photos set
    participation_id = null, matched_by_staff_profile_id = null, matched_at = null
  where id = p_photo_id;
  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_campaign_id, v_photo.participation_id, p_staff_profile_id, 'staff', 'photo_day_photo_unmatched', jsonb_build_object('photoId', p_photo_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Withdrawn consent must take effect immediately: unmatch that child's photos.
-- Called by the consent-withdrawal route in the same request that sets
-- withdrawn_at (later checkpoint wires the route).
create or replace function public.release_photo_day_photos_for_withdrawn_consent(
  p_participation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if exists (
    select 1 from public.squad_invite_permissions
    where participation_id = p_participation_id and purpose = 'photo_day_photography'
      and granted = true and withdrawn_at is null
  ) then
    return 0;
  end if;
  update public.squad_invite_photo_day_photos set
    participation_id = null, matched_by_staff_profile_id = null, matched_at = null
  where participation_id = p_participation_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter function public.record_photo_day_photo(uuid, text, text, bigint) owner to postgres;
alter function public.match_photo_day_photo(uuid, uuid, uuid) owner to postgres;
alter function public.unmatch_photo_day_photo(uuid, uuid) owner to postgres;
alter function public.release_photo_day_photos_for_withdrawn_consent(uuid) owner to postgres;
revoke all on function public.record_photo_day_photo(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.match_photo_day_photo(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.unmatch_photo_day_photo(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_photo_day_photos_for_withdrawn_consent(uuid) from public, anon, authenticated;
grant execute on function public.record_photo_day_photo(uuid, text, text, bigint) to service_role;
grant execute on function public.match_photo_day_photo(uuid, uuid, uuid) to service_role;
grant execute on function public.unmatch_photo_day_photo(uuid, uuid) to service_role;
grant execute on function public.release_photo_day_photos_for_withdrawn_consent(uuid) to service_role;

comment on table public.squad_invite_photo_days is
  'Photo Day mode of a Squad Invite. Photographer access is a hashed, expiring, upload-only token. Children''s photos must be deleted by photos_delete_after.';
comment on table public.squad_invite_photo_day_photos is
  'Matchday photos of children. Matching requires an unwithdrawn photo_day_photography permission (enforced in match_photo_day_photo). Never exposed to anon/authenticated roles.';

-- Forward correction: before real use, drop the four functions and two
-- tables in reverse order and restore the two constraints to the 0103 /
-- 0050 lists. After real use, delete storage objects first, then correct
-- forward; keep audit events.
