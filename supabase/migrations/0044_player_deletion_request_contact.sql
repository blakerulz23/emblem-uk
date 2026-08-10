-- Snapshot the requesting guardian's email onto the request row itself,
-- rather than relying only on player_deletion_requests.requested_by ->
-- profiles(id) (on delete set null, 0041). If that guardian later deletes
-- their own account (delete_own_guardian_account, 0042), requested_by
-- would go null and staff would lose any way to notify them once the
-- request is eventually completed — the exact "retain enough contact
-- information to notify them after completion, without keeping
-- unnecessary data" requirement. A denormalized snapshot at request time
-- is the minimum needed; nothing else about the guardian is captured.
alter table player_deletion_requests add column requester_email text;

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

  return v_request_id;
end;
$$;

revoke all on function public.request_player_deletion(uuid, text, text) from public;
revoke all on function public.request_player_deletion(uuid, text, text) from anon;
grant execute on function public.request_player_deletion(uuid, text, text) to authenticated;

-- Old two-argument overload no longer used by the app (the account-
-- deletion RPC, 0042, calls the table directly for its own automatic
-- filing, never this function) — dropped so there's exactly one, current
-- signature.
drop function if exists public.request_player_deletion(uuid, text);

-- Staff need to read/update requests (mark completed) from the new
-- /staff/deletion-requests page — staff_accounts membership is enforced
-- by requireStaff() in the route/page itself (service-role client, same
-- pattern as every other staff surface), so a table-level grant here is
-- safe: it's service_role's grant, not a new client-facing RLS policy.
grant select, update on player_deletion_requests to service_role;

-- delete_own_guardian_account (0042) also auto-files a request when a
-- guardian deleting their own account was the sole guardian of a player —
-- that path needs the same requester_email snapshot, read directly from
-- auth.users here (safe: SECURITY DEFINER runs with the function owner's
-- privileges, which can read auth.users, same trust boundary this
-- function already operates in for auth.uid() itself).
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
        insert into public.player_deletion_requests (player_id, requested_by, requester_email, notes)
        select v_player_id, v_uid, v_email, 'Automatic: filed because the sole guardian deleted their account'
        where not exists (
          select 1 from public.player_deletion_requests
          where player_id = v_player_id and status = 'pending'
        );
        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        v_players_deletion_requested := v_players_deletion_requested || v_player_id;
      end if;
    end loop;
  end if;

  delete from public.active_viewers where profile_id = v_uid;
  delete from public.story_updates where recipient_profile_id = v_uid;
  update public.coach_invites set created_by = null where created_by = v_uid;
  update public.coach_invites set used_by = null where used_by = v_uid;
  update public.player_invites set created_by = null where created_by = v_uid;
  update public.player_invites set used_by = null where used_by = v_uid;
  update public.moments set uploaded_by = null where uploaded_by = v_uid;

  delete from public.profiles where id = v_uid;

  return jsonb_build_object(
    'playersUnlinked', to_jsonb(v_players_unlinked),
    'playersDeletionRequested', to_jsonb(v_players_deletion_requested)
  );
end;
$$;

revoke all on function public.delete_own_guardian_account() from public;
revoke all on function public.delete_own_guardian_account() from anon;
grant execute on function public.delete_own_guardian_account() to authenticated;
