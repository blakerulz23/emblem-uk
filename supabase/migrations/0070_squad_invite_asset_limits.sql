-- Gate 1 — per-participation asset ledger for Squad Invite's own branch of
-- /api/order-assets (a parent uploading their child's photo). Previously
-- this branch had no aggregate file-count or byte ceiling at all: any
-- number of uploads of any size (up to the per-file cap) were accepted
-- against one participation indefinitely.
--
-- Deliberately does NOT touch squad_invite_participations or any other
-- table from an already-applied migration (0050 and onward) — this is a
-- new, additive table plus new functions only. Mirrors
-- builder_submission_assets/reserve_builder_submission_asset_slot from
-- migration 0068 exactly (same slot-based replacement-delta accounting,
-- same reservation-versioned reserve/finish/release contract) rather than
-- a second, different design, because the two problems are identical in
-- shape — only the ownership-verification predicate differs (a
-- participation's builder_token_hash match instead of a capability's own
-- token_hash). See migration 0068's header comment for the full
-- explanation of why byte-value matching alone is unsafe for concurrent
-- same-slot replacement, and why a random reservation_id fixes it.
create table public.squad_invite_participation_assets (
  participation_id uuid not null references public.squad_invite_participations(id) on delete cascade,
  slot_key text not null check (char_length(slot_key) between 1 and 128),
  bytes bigint not null check (bytes >= 0),
  reservation_id uuid,
  updated_at timestamptz not null default now(),
  primary key (participation_id, slot_key)
);

alter table public.squad_invite_participation_assets enable row level security;
revoke all on public.squad_invite_participation_assets from public, anon, authenticated;
grant select, insert, update, delete on public.squad_invite_participation_assets to service_role;

-- Atomically reserves capacity for one asset slot for a Squad Invite
-- participation BEFORE the caller uploads to S3 (to a reservation-specific
-- temporary key) — same reserve-before-upload rationale as migration
-- 0068's builder equivalent. Verifies ownership (the caller's
-- builder_token_hash must match this exact participation) AND that the
-- participation is still 'started' (once committed, its assets are locked
-- in — matches order-assets route's pre-existing squad-invite branch
-- check) in the SAME locked read as the capacity check, so a participation
-- that completes or is revoked between an earlier auth check and this call
-- is still caught here.
--
-- Returns (ok, previous_bytes, reservation_id) with the same meaning as
-- migration 0068's reserve_builder_submission_asset_slot.
create or replace function public.reserve_squad_invite_participation_asset_slot(
  p_participation_id uuid,
  p_builder_token_hash text,
  p_slot_key text,
  p_bytes bigint,
  p_max_count integer,
  p_max_total_bytes bigint
)
returns table(ok boolean, previous_bytes bigint, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owned boolean;
  v_existing_bytes bigint;
  v_current_count integer;
  v_current_total bigint;
  v_new_count integer;
  v_new_total bigint;
  v_new_reservation_id uuid;
begin
  if p_bytes is null or p_bytes < 0 or p_slot_key is null or char_length(p_slot_key) < 1 then
    return query select false, null::bigint, null::uuid;
    return;
  end if;

  select exists(
    select 1 from public.squad_invite_participations
    where id = p_participation_id
      and builder_token_hash = p_builder_token_hash
      and status = 'started'
    for update
  ) into v_owned;
  if not v_owned then
    return query select false, null::bigint, null::uuid;
    return;
  end if;

  select bytes into v_existing_bytes
    from public.squad_invite_participation_assets
    where participation_id = p_participation_id and slot_key = p_slot_key
    for update;

  select count(*), coalesce(sum(bytes), 0) into v_current_count, v_current_total
    from public.squad_invite_participation_assets
    where participation_id = p_participation_id;

  v_new_count := v_current_count + (case when v_existing_bytes is null then 1 else 0 end);
  v_new_total := v_current_total - coalesce(v_existing_bytes, 0) + p_bytes;

  if v_new_count > p_max_count or v_new_total > p_max_total_bytes or v_new_total < 0 then
    return query select false, v_existing_bytes, null::uuid;
    return;
  end if;

  v_new_reservation_id := gen_random_uuid();

  insert into public.squad_invite_participation_assets(participation_id, slot_key, bytes, reservation_id)
    values (p_participation_id, p_slot_key, p_bytes, v_new_reservation_id)
    on conflict (participation_id, slot_key) do update
      set bytes = excluded.bytes, reservation_id = excluded.reservation_id, updated_at = now();

  return query select true, v_existing_bytes, v_new_reservation_id;
end;
$$;

-- Confirms whether a caller's reservation is still current for its slot —
-- same contract as migration 0068's
-- finish_builder_submission_asset_reservation.
create or replace function public.finish_squad_invite_participation_asset_reservation(
  p_participation_id uuid,
  p_slot_key text,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
begin
  select reservation_id into v_current
    from public.squad_invite_participation_assets
    where participation_id = p_participation_id and slot_key = p_slot_key
    for update;
  return v_current is not null and v_current = p_reservation_id;
end;
$$;

-- Reverses a reservation when the S3 write that was supposed to follow it
-- failed instead, ONLY when p_reservation_id still matches the row's
-- CURRENT one. Same contract and safety properties as migration 0068's
-- release_builder_submission_asset_slot.
create or replace function public.release_squad_invite_participation_asset_slot(
  p_participation_id uuid,
  p_slot_key text,
  p_reservation_id uuid,
  p_previous_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matched integer := 0;
begin
  if p_previous_bytes is null then
    delete from public.squad_invite_participation_assets
      where participation_id = p_participation_id and slot_key = p_slot_key and reservation_id = p_reservation_id;
    get diagnostics v_matched = row_count;
    return v_matched > 0;
  else
    update public.squad_invite_participation_assets
      set bytes = p_previous_bytes, reservation_id = null, updated_at = now()
      where participation_id = p_participation_id and slot_key = p_slot_key and reservation_id = p_reservation_id;
    get diagnostics v_matched = row_count;
    return v_matched > 0;
  end if;
end;
$$;

alter function public.reserve_squad_invite_participation_asset_slot(uuid, text, text, bigint, integer, bigint) owner to postgres;
alter function public.finish_squad_invite_participation_asset_reservation(uuid, text, uuid) owner to postgres;
alter function public.release_squad_invite_participation_asset_slot(uuid, text, uuid, bigint) owner to postgres;

revoke all on function public.reserve_squad_invite_participation_asset_slot(uuid, text, text, bigint, integer, bigint) from public, anon, authenticated;
revoke all on function public.finish_squad_invite_participation_asset_reservation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.release_squad_invite_participation_asset_slot(uuid, text, uuid, bigint) from public, anon, authenticated;

grant execute on function public.reserve_squad_invite_participation_asset_slot(uuid, text, text, bigint, integer, bigint) to service_role;
grant execute on function public.finish_squad_invite_participation_asset_reservation(uuid, text, uuid) to service_role;
grant execute on function public.release_squad_invite_participation_asset_slot(uuid, text, uuid, bigint) to service_role;

comment on table public.squad_invite_participation_assets is 'Per-slot upload ledger for one Squad Invite participation''s /api/order-assets usage — counts/aggregate bytes are always derived from this table (count()/sum()), never separately stored. reservation_id versions each slot so concurrent same-slot replacements cannot corrupt each other. Never persists a raw builder token, only receives an already-hashed value to verify ownership against squad_invite_participations.builder_token_hash.';
