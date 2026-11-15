-- Photo Day phase 3: parent permission and release to parents.
--
-- Design: docs/architecture/photo-day-design-v0.1.md
--
--   * record_photo_day_consent: the parent grants, declines or withdraws
--     photo_day_photography for their own participation. Granting also
--     records the child's first name, surname initial and squad number on
--     the participation's existing display columns (cleared by the 0076
--     erasure flow), so staff can tell children apart when matching.
--     Withdrawing unmatches the child's photos at once and clears those
--     columns again (the participation is still 'started', so commitment
--     has not written them yet).
--   * publish_photo_day: staff release matched photos to parents. Parents
--     see nothing before this, so a match staff are still checking can
--     never be shown to the wrong family.
--
-- Depends on 0105. Additive, apart from widening the audit event list again.

-- 1. Audit event types (0105 list + parent consent) ----------------------------
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
      'photo_day_coach_permissions_confirmed','photo_day_photographer_link_revoked',
      'photo_day_consent_granted','photo_day_consent_declined','photo_day_consent_withdrawn'
    ]));

-- 2. Parent consent ----------------------------------------------------------
-- The caller must own the participation (guardian + builder token hash, the
-- same proof the commit route uses) and it must still be 'started'.
-- Granting is only possible before any photo is uploaded (status
-- 'scheduled'): the photographer culls children without permission at the
-- shoot, so permission given afterwards could never produce photos.
-- Declining or withdrawing is always possible.
create or replace function public.record_photo_day_consent(
  p_participation_id uuid,
  p_guardian_profile_id uuid,
  p_builder_token_hash text,
  p_granted boolean,
  p_first_name text,
  p_surname_initial text,
  p_squad_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_day public.squad_invite_photo_days%rowtype;
  v_permission public.squad_invite_permissions%rowtype;
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_initial text := upper(trim(coalesce(p_surname_initial, '')));
  v_released integer := 0;
  v_has_permission boolean;
begin
  if p_granted is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_choice');
  end if;
  select * into v_participation from public.squad_invite_participations
  where id = p_participation_id
    and guardian_profile_id = p_guardian_profile_id
    and builder_token_hash = p_builder_token_hash
  for update;
  if not found or v_participation.child_data_erased_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'participation_not_found');
  end if;
  if v_participation.status <> 'started' then
    return jsonb_build_object('ok', false, 'reason', 'participation_not_open');
  end if;
  select * into v_day from public.squad_invite_photo_days where campaign_id = v_participation.campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_photo_day');
  end if;

  select * into v_permission from public.squad_invite_permissions
  where campaign_id = v_participation.campaign_id and participation_id = p_participation_id
    and purpose = 'photo_day_photography' and policy_version = 'squad_invite_photo_day_v1'
  for update;
  v_has_permission := found;

  if p_granted then
    if v_day.status <> 'scheduled' or v_day.photos_deleted_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'photo_day_already_taken');
    end if;
    if v_first is null or char_length(v_first) > 24
       or v_initial !~ '^[A-Z]$'
       or (p_squad_number is not null and p_squad_number not between 0 and 999) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_child_details');
    end if;
    if v_has_permission then
      update public.squad_invite_permissions set
        granted = true, withdrawn_at = null, recorded_at = now(), actor_profile_id = p_guardian_profile_id,
        evidence = jsonb_build_object('source', 'squad_invite_join', 'photoDayId', v_day.id)
      where id = v_permission.id;
    else
      insert into public.squad_invite_permissions(campaign_id, participation_id, actor_profile_id, purpose, policy_version, granted, evidence)
      values (v_participation.campaign_id, p_participation_id, p_guardian_profile_id, 'photo_day_photography',
        'squad_invite_photo_day_v1', true, jsonb_build_object('source', 'squad_invite_join', 'photoDayId', v_day.id));
    end if;
    update public.squad_invite_participations set
      display_first_name = v_first,
      display_surname_initial = v_initial,
      squad_number = p_squad_number,
      updated_at = now()
    where id = p_participation_id;
    insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
    values (v_participation.campaign_id, p_participation_id, p_guardian_profile_id, 'parent', 'photo_day_consent_granted',
      jsonb_build_object('photoDayId', v_day.id));
    return jsonb_build_object('ok', true, 'decision', 'granted');
  end if;

  -- Decline or withdraw.
  if v_has_permission and v_permission.granted and v_permission.withdrawn_at is null then
    update public.squad_invite_permissions set withdrawn_at = now() where id = v_permission.id;
    v_released := public.release_photo_day_photos_for_withdrawn_consent(p_participation_id);
    update public.squad_invite_participations set
      display_first_name = null, display_surname_initial = null, squad_number = null, updated_at = now()
    where id = p_participation_id;
    insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
    values (v_participation.campaign_id, p_participation_id, p_guardian_profile_id, 'parent', 'photo_day_consent_withdrawn',
      jsonb_build_object('photoDayId', v_day.id, 'photosReleased', v_released));
    return jsonb_build_object('ok', true, 'decision', 'withdrawn', 'photosReleased', v_released);
  end if;
  if not v_has_permission then
    insert into public.squad_invite_permissions(campaign_id, participation_id, actor_profile_id, purpose, policy_version, granted, evidence)
    values (v_participation.campaign_id, p_participation_id, p_guardian_profile_id, 'photo_day_photography',
      'squad_invite_photo_day_v1', false, jsonb_build_object('source', 'squad_invite_join', 'photoDayId', v_day.id));
    insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
    values (v_participation.campaign_id, p_participation_id, p_guardian_profile_id, 'parent', 'photo_day_consent_declined',
      jsonb_build_object('photoDayId', v_day.id));
  end if;
  return jsonb_build_object('ok', true, 'decision', 'declined');
end;
$$;

-- 3. Release to parents -------------------------------------------------------
-- matching -> published. Unmatching still works afterwards (0104 has no
-- status check on unmatch), so staff can correct a mistake; new matches
-- are not made after publishing.
create or replace function public.publish_photo_day(
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
  if v_day.status <> 'matching' or v_day.photos_deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_matching');
  end if;

  update public.squad_invite_photo_days set
    status = 'published',
    -- No more uploads once parents can see photos.
    photographer_token_hash = null, photographer_token_expires_at = null,
    updated_at = now()
  where id = p_photo_day_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, p_staff_profile_id, 'staff', 'photo_day_status_changed',
    jsonb_build_object('photoDayId', p_photo_day_id, 'from', v_day.status, 'to', 'published'));
  return jsonb_build_object('ok', true);
end;
$$;

alter function public.record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer) owner to postgres;
alter function public.publish_photo_day(uuid, uuid) owner to postgres;
revoke all on function public.record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer) from public, anon, authenticated;
revoke all on function public.publish_photo_day(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer) to service_role;
grant execute on function public.publish_photo_day(uuid, uuid) to service_role;

-- Forward correction: before real use, drop these two functions and
-- restore the audit constraint to the 0105 list. After real use, keep the
-- audit events and permission rows (they are the consent record).
