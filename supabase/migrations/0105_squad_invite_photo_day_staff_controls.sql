-- Photo Day phase 2: staff controls.
--
-- Design: docs/architecture/photo-day-design-v0.1.md
--
-- Every staff action that changes a photo day goes through one of these
-- functions, so the row change and its audit event happen in the same
-- transaction (no route can update the table and forget the audit row):
--   * create_squad_invite_photo_day
--   * confirm_photo_day_coach_permissions
--   * issue_photo_day_photographer_link   (stores only the token's SHA-256)
--   * revoke_photo_day_photographer_link
--
-- Depends on 0104. Additive, apart from widening the audit event list again.

-- 1. Audit event types (0104 list + two staff events) -------------------------
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
      'photo_day_photos_deleted',
      'photo_day_coach_permissions_confirmed','photo_day_photographer_link_revoked'
    ]));

-- 2. Create ------------------------------------------------------------------
-- One photo day per campaign (0104's unique campaign_id). The shoot must
-- fall on or before the campaign deadline: parents need the photos while
-- they can still commit. photos_delete_after starts at the 60-days-after-
-- the-shoot ceiling Blake approved (15 Nov 2026); phase 4 brings it forward
-- to 30 days after the campaign closes when that is sooner.
create or replace function public.create_squad_invite_photo_day(
  p_campaign_id uuid,
  p_staff_profile_id uuid,
  p_scheduled_for date,
  p_venue_label text,
  p_photographer_name text,
  p_max_photos integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.squad_invites%rowtype;
  v_id uuid;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  select * into v_campaign from public.squad_invites where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'campaign_not_found');
  end if;
  if v_campaign.campaign_status not in ('approved_setup_required','active') then
    return jsonb_build_object('ok', false, 'reason', 'campaign_not_open');
  end if;
  if exists (select 1 from public.squad_invite_photo_days where campaign_id = p_campaign_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_exists');
  end if;
  if p_scheduled_for is null
     or p_scheduled_for < (now() at time zone 'Europe/London')::date
     or p_scheduled_for > (v_campaign.deadline_at at time zone 'Europe/London')::date then
    return jsonb_build_object('ok', false, 'reason', 'date_outside_campaign');
  end if;
  if p_venue_label is null or char_length(trim(p_venue_label)) not between 2 and 160
     or p_photographer_name is null or char_length(trim(p_photographer_name)) not between 2 and 120
     or p_max_photos is null or p_max_photos not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_details');
  end if;

  insert into public.squad_invite_photo_days(
    campaign_id, scheduled_for, venue_label, photographer_name, max_photos,
    photos_delete_after, created_by_staff_profile_id
  ) values (
    p_campaign_id, p_scheduled_for, trim(p_venue_label), trim(p_photographer_name), p_max_photos,
    ((p_scheduled_for + 60)::timestamp at time zone 'Europe/London'), p_staff_profile_id
  ) returning id into v_id;

  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (p_campaign_id, p_staff_profile_id, 'staff', 'photo_day_scheduled',
    jsonb_build_object('photoDayId', v_id, 'scheduledFor', p_scheduled_for, 'maxPhotos', p_max_photos));
  return jsonb_build_object('ok', true, 'photoDayId', v_id);
end;
$$;

-- 3. Coach permission ----------------------------------------------------------
-- Records that staff confirmed both coaches agreed to matchday photography.
-- The note says how (e.g. "both managers by email, 14 Nov"). Confirming
-- twice keeps the first time; it is not something to "re-confirm" silently.
create or replace function public.confirm_photo_day_coach_permissions(
  p_photo_day_id uuid,
  p_staff_profile_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.squad_invite_photo_days%rowtype;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  select * into v_day from public.squad_invite_photo_days where id = p_photo_day_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_found');
  end if;
  if v_day.status in ('closed','cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_closed');
  end if;
  if v_day.coach_permissions_confirmed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_confirmed');
  end if;
  if p_note is null or char_length(trim(p_note)) not between 5 and 300 then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;

  update public.squad_invite_photo_days set
    coach_permissions_confirmed_at = now(),
    coach_permissions_note = trim(p_note),
    updated_at = now()
  where id = p_photo_day_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, p_staff_profile_id, 'staff', 'photo_day_coach_permissions_confirmed',
    jsonb_build_object('photoDayId', p_photo_day_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- 4. Photographer link -------------------------------------------------------
-- Issuing replaces any earlier link (the old token stops working at once).
-- Refused until coach permission is confirmed, so staff never hand out a
-- link whose uploads would all be rejected. At most 7 days.
create or replace function public.issue_photo_day_photographer_link(
  p_photo_day_id uuid,
  p_staff_profile_id uuid,
  p_token_hash text,
  p_valid_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.squad_invite_photo_days%rowtype;
  v_expires timestamptz;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if p_valid_hours is null or p_valid_hours not between 1 and 168 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_validity');
  end if;
  select * into v_day from public.squad_invite_photo_days where id = p_photo_day_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_found');
  end if;
  if v_day.status not in ('scheduled','shooting') or v_day.photos_deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_accepting_uploads');
  end if;
  if v_day.coach_permissions_confirmed_at is null then
    return jsonb_build_object('ok', false, 'reason', 'coach_permissions_unconfirmed');
  end if;

  v_expires := now() + make_interval(hours => p_valid_hours);
  update public.squad_invite_photo_days set
    photographer_token_hash = p_token_hash,
    photographer_token_expires_at = v_expires,
    updated_at = now()
  where id = p_photo_day_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, p_staff_profile_id, 'staff', 'photo_day_photographer_link_issued',
    jsonb_build_object('photoDayId', p_photo_day_id, 'expiresAt', v_expires,
      'replacedEarlierLink', v_day.photographer_token_hash is not null));
  return jsonb_build_object('ok', true, 'expiresAt', v_expires);
end;
$$;

create or replace function public.revoke_photo_day_photographer_link(
  p_photo_day_id uuid,
  p_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.squad_invite_photo_days%rowtype;
begin
  if not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  select * into v_day from public.squad_invite_photo_days where id = p_photo_day_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_found');
  end if;
  if v_day.photographer_token_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_link');
  end if;

  update public.squad_invite_photo_days set
    photographer_token_hash = null,
    photographer_token_expires_at = null,
    updated_at = now()
  where id = p_photo_day_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, p_staff_profile_id, 'staff', 'photo_day_photographer_link_revoked',
    jsonb_build_object('photoDayId', p_photo_day_id));
  return jsonb_build_object('ok', true);
end;
$$;

alter function public.create_squad_invite_photo_day(uuid, uuid, date, text, text, integer) owner to postgres;
alter function public.confirm_photo_day_coach_permissions(uuid, uuid, text) owner to postgres;
alter function public.issue_photo_day_photographer_link(uuid, uuid, text, integer) owner to postgres;
alter function public.revoke_photo_day_photographer_link(uuid, uuid) owner to postgres;
revoke all on function public.create_squad_invite_photo_day(uuid, uuid, date, text, text, integer) from public, anon, authenticated;
revoke all on function public.confirm_photo_day_coach_permissions(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.issue_photo_day_photographer_link(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.revoke_photo_day_photographer_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_squad_invite_photo_day(uuid, uuid, date, text, text, integer) to service_role;
grant execute on function public.confirm_photo_day_coach_permissions(uuid, uuid, text) to service_role;
grant execute on function public.issue_photo_day_photographer_link(uuid, uuid, text, integer) to service_role;
grant execute on function public.revoke_photo_day_photographer_link(uuid, uuid) to service_role;

-- Forward correction: before real use, drop these four functions and
-- restore the audit constraint to the 0104 list. After real use, keep the
-- audit events (the two new event types must stay allowed while rows use them).
