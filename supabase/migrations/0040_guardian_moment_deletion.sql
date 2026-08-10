-- Guardian-initiated moment deletion (Account Settings MVP).
--
-- No DELETE policy exists for guardians on moments/moment_media today —
-- only a coach-scoped, pending-only one ("moments: coaches can delete
-- their team's pending moments", 0032). Per the explicit product
-- instruction not to widen the raw DELETE grant, this follows the same
-- SECURITY DEFINER pattern already established by
-- update_player_public_visibility (0039) and update_primary_position
-- (0036): the function does its own auth.uid()-based ownership check,
-- then bypasses RLS internally — `authenticated` never gets a table-level
-- DELETE grant on either table for this.
--
-- Deliberately does NOT delete the S3 objects — Postgres can't call AWS.
-- The caller (a server-only Next.js route) fetches the authoritative
-- s3_key list via the normal session-scoped client BEFORE calling this
-- (moment_media's existing SELECT RLS policy already scopes reads to the
-- moment's real guardians/coaches), deletes those S3 objects, and only
-- then calls this function to commit the DB deletion — S3-first matches
-- the product spec's explicit ordering for this operation (contrast with
-- the existing player-deletion runbook's DB-first order for a full
-- player cascade, a deliberately different tradeoff — see the audit
-- report for why).
create or replace function public.delete_own_moment(p_moment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select player_id into v_player_id from public.moments where id = p_moment_id;
  if v_player_id is null then
    -- Already gone (or never existed) — treat as success so a retried
    -- request after a prior partial failure is idempotent, not an error.
    return true;
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = v_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to delete this moment';
  end if;

  -- Explicit, not relied-on-cascade — moment_media/moment_visibility_changes/
  -- story_updates.related_moment_id are all `on delete cascade` already,
  -- but deleting moment_media explicitly first keeps this function's own
  -- intent auditable without depending on a schema detail changing later.
  delete from public.moment_media where moment_id = p_moment_id;
  delete from public.moments where id = p_moment_id;

  return true;
end;
$$;

revoke all on function public.delete_own_moment(uuid) from public;
revoke all on function public.delete_own_moment(uuid) from anon;
grant execute on function public.delete_own_moment(uuid) to authenticated;
