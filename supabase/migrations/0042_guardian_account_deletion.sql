-- Guardian account deletion (Account Settings MVP) — the SQL half of the
-- operation. Deliberately does NOT touch auth.users itself: that requires
-- the Supabase Auth admin API (a service-role HTTP call, not SQL), called
-- by the server-only route immediately after this function succeeds — see
-- src/app/api/os/account/delete/route.ts.
--
-- Several FKs referencing profiles are `on delete no action` (confirmed
-- via live information_schema introspection against staging, not just
-- reading migration files): moments.uploaded_by, story_updates.
-- recipient_profile_id, coach_invites.created_by/used_by, player_invites.
-- created_by/used_by, active_viewers.profile_id. None of that is
-- cascade-free the way a full player deletion already is — a raw
-- `delete from profiles` would simply fail against real data with any of
-- these rows still present. This function handles each explicitly rather
-- than leaving the caller to discover the FK violation at delete time.
--
-- Per-player contract (confirmed with the product owner, not inferred):
-- deleting a guardian's account is never assumed to mean deleting a child
-- shared with another guardian.
--   - Other guardians remain for a player -> unlink only (delete this
--     guardian's own guardians row); the player, their moments, and the
--     other guardian's access are untouched. This guardian's own
--     uploaded_by/created_by/used_by references on surviving rows for
--     that player are nulled (a minor, arguably privacy-positive loss of
--     attribution on data they no longer have access to — not data loss).
--   - This guardian is the sole guardian -> never silently delete or
--     orphan the player. A player_deletion_requests row is filed instead
--     (0041) — the same request-based contract as the standalone "Request
--     player-data deletion" action — and this guardian's own link is
--     still removed (their account is being deleted; the player is left
--     with zero guardians until staff processes the filed request, a
--     deliberately visible, findable state via that table rather than a
--     silent orphan).
create or replace function public.delete_own_guardian_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
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
        insert into public.player_deletion_requests (player_id, requested_by, notes)
        select v_player_id, v_uid, 'Automatic: filed because the sole guardian deleted their account'
        where not exists (
          select 1 from public.player_deletion_requests
          where player_id = v_player_id and status = 'pending'
        );
        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        v_players_deletion_requested := v_players_deletion_requested || v_player_id;
      end if;
    end loop;
  end if;

  -- This guardian's own residual references, unscoped to any specific
  -- player above — catches anything the per-player loop didn't (there
  -- shouldn't be any, since coach_invites/player_invites/moments.
  -- uploaded_by all carry a player_id that the loop already covered, but
  -- this is the defense-in-depth pass that actually unblocks the profile
  -- delete below regardless).
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
