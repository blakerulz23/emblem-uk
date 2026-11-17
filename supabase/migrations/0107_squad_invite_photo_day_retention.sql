-- Photo Day phase 4: retention and erasure.
--
-- Design: docs/architecture/photo-day-design-v0.1.md
--
-- 1. Retention (Blake, 15 Nov 2026): every photo, matched or not, is
--    deleted 30 days after the campaign closes, and never later than 60
--    days after the shoot. "Closes" is the earliest of pricing
--    finalisation (closed_at), cancellation and the deadline. The
--    organiser's early close (0066) is not used: it can be reopened and
--    records no timestamp. The cron route deletes the S3 objects; these
--    functions decide what is due and record what was deleted.
-- 2. Erasure: confirm_squad_invite_participation_erasure (0076) now also
--    puts every Photo Day photo matched to the child into the erasure's
--    own storage inventory and unmatches/marks those rows in the same
--    transaction, so an erasure only reports completed once they are gone.
--
-- Depends on 0106.

-- 1. Effective delete-by time ---------------------------------------------------
create or replace function public.photo_day_effective_delete_after(p_photo_day_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    d.photos_delete_after,
    least(c.closed_at, c.cancelled_at, c.deadline_at) + interval '30 days'
  )
  from public.squad_invite_photo_days d
  join public.squad_invites c on c.id = d.campaign_id
  where d.id = p_photo_day_id;
$$;

-- Photo days whose photos are due for deletion and not yet fully deleted.
create or replace function public.list_photo_days_due_for_deletion(p_limit integer)
returns table (photo_day_id uuid, campaign_id uuid, delete_after timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.campaign_id, public.photo_day_effective_delete_after(d.id)
  from public.squad_invite_photo_days d
  where d.photos_deleted_at is null
    and public.photo_day_effective_delete_after(d.id) <= now()
  order by 3
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Called by the cron AFTER the S3 object is deleted. Refuses a photo whose
-- day is not due, so a bug in the route can never mark early.
create or replace function public.mark_photo_day_photo_storage_deleted(p_photo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.squad_invite_photo_day_photos%rowtype;
begin
  select * into v_photo from public.squad_invite_photo_day_photos where id = p_photo_id for update;
  if not found then return false; end if;
  if v_photo.deleted_at is not null then return true; end if;
  if public.photo_day_effective_delete_after(v_photo.photo_day_id) > now() then
    return false;
  end if;
  update public.squad_invite_photo_day_photos set
    participation_id = null, matched_by_staff_profile_id = null, matched_at = null, deleted_at = now()
  where id = p_photo_id;
  return true;
end;
$$;

-- Called by the cron once every row is marked AND the day's whole S3 prefix
-- has been emptied (which also removes objects that never got a row).
create or replace function public.close_photo_day_after_deletion(p_photo_day_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.squad_invite_photo_days%rowtype;
  v_deleted integer;
begin
  select * into v_day from public.squad_invite_photo_days where id = p_photo_day_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'photo_day_not_found');
  end if;
  if v_day.photos_deleted_at is not null then
    return jsonb_build_object('ok', true, 'alreadyClosed', true);
  end if;
  if public.photo_day_effective_delete_after(p_photo_day_id) > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;
  if exists (select 1 from public.squad_invite_photo_day_photos where photo_day_id = p_photo_day_id and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'photos_remaining');
  end if;
  select count(*) into v_deleted from public.squad_invite_photo_day_photos where photo_day_id = p_photo_day_id;

  update public.squad_invite_photo_days set
    photos_deleted_at = now(),
    -- A day that never had coach permission can't be 'closed' (0104
    -- constraint); it never went past 'scheduled', so it is 'cancelled'.
    status = case when coach_permissions_confirmed_at is null then 'cancelled' else 'closed' end,
    photographer_token_hash = null, photographer_token_expires_at = null,
    updated_at = now()
  where id = p_photo_day_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_role, event_type, metadata)
  values (v_day.campaign_id, 'system', 'photo_day_photos_deleted',
    jsonb_build_object('photoDayId', p_photo_day_id, 'photosDeleted', v_deleted, 'reason', 'retention'));
  return jsonb_build_object('ok', true, 'photosDeleted', v_deleted);
end;
$$;

alter function public.photo_day_effective_delete_after(uuid) owner to postgres;
alter function public.list_photo_days_due_for_deletion(integer) owner to postgres;
alter function public.mark_photo_day_photo_storage_deleted(uuid) owner to postgres;
alter function public.close_photo_day_after_deletion(uuid) owner to postgres;
revoke all on function public.photo_day_effective_delete_after(uuid) from public, anon, authenticated;
revoke all on function public.list_photo_days_due_for_deletion(integer) from public, anon, authenticated;
revoke all on function public.mark_photo_day_photo_storage_deleted(uuid) from public, anon, authenticated;
revoke all on function public.close_photo_day_after_deletion(uuid) from public, anon, authenticated;
grant execute on function public.photo_day_effective_delete_after(uuid) to service_role;
grant execute on function public.list_photo_days_due_for_deletion(integer) to service_role;
grant execute on function public.mark_photo_day_photo_storage_deleted(uuid) to service_role;
grant execute on function public.close_photo_day_after_deletion(uuid) to service_role;

-- 2. Erasure ---------------------------------------------------------------------
alter table public.squad_invite_participation_deletion_storage_objects
  drop constraint squad_invite_participation_deletion_storage_objects_kind_check,
  add constraint squad_invite_participation_deletion_storage_objects_kind_check
    check (kind in ('participation_photo', 'player_photo', 'moment_media', 'card_artwork', 'other', 'photo_day_photo'));

-- Identical to 0076 except the block marked "Photo Day (0107)".
create or replace function public.confirm_squad_invite_participation_erasure(p_request_id uuid, p_completion_note text)
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
  v_photo record;
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

  -- Photo Day (0107): every photo matched to this child goes into this
  -- erasure's storage inventory (deleted from S3 by the execute route and
  -- tracked to completion like every other object), and the row is
  -- unmatched and marked deleted now, so no staff or parent view can show
  -- it in the meantime. Photos never matched to the child are covered by
  -- the retention sweep (at most 60 days after the shoot).
  for v_photo in
    select id, storage_key from public.squad_invite_photo_day_photos
    where participation_id = v_participation_id and deleted_at is null
    for update
  loop
    insert into public.squad_invite_participation_deletion_storage_objects (request_id, s3_key, kind)
    values (p_request_id, v_photo.storage_key, 'photo_day_photo')
    on conflict do nothing;
    update public.squad_invite_photo_day_photos set
      participation_id = null, matched_by_staff_profile_id = null, matched_at = null, deleted_at = now()
    where id = v_photo.id;
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

-- create or replace keeps 0076's owner and grants; restated so this file
-- alone shows who may call it.
revoke all on function public.confirm_squad_invite_participation_erasure(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_squad_invite_participation_erasure(uuid, text) to authenticated;

-- Forward correction: before real use, restore 0076's function body, the
-- kind constraint without 'photo_day_photo' (only if no inventory row uses
-- it), and drop the four retention functions. After real use, keep the
-- 'photo_day_photo' kind while any inventory row has it.
