-- Guardian-invite write lockdown (applied immediately after 0089, in the
-- same maintenance window).
--
-- Until now a signed-in user could INSERT every column of player_invites.
-- RLS limited which player (the caller's own child, or a player on a team
-- they actively coach) and required created_by = the caller, but nothing
-- stopped them writing used_at, used_by, created_at, expires_at, order_id,
-- email_status or the id. A guardian or coach could therefore create a
-- guardian invite that looked already consumed by someone else, backdated,
-- never expiring, or tied to an order.
--
-- The one legitimate signed-in insert (/api/os/invites through
-- createGuardianInvite with the user's session) writes exactly five
-- columns: player_id, code, created_by, invited_email, origin. Every other
-- write (order approval, resend, recovery, redemption, account deletion,
-- child erasure) runs as service_role or in SECURITY DEFINER functions and
-- is unchanged.
--
--   0. Precondition: refuses, changing nothing, unless 0089 is in place.
--   1. anon and authenticated lose INSERT, UPDATE and DELETE on the table
--      (they held no UPDATE or DELETE; the revoke makes that explicit).
--   2. authenticated may INSERT only the five legitimate columns. The
--      existing INSERT policies still decide which player an inviter may
--      target.
--
-- No row, sequence, policy or function changes, and no audit event is
-- written. SELECT and service_role privileges are untouched.
-- Rollback: supabase/rollback/0090_rollback.sql (reopens the forgery).

begin;

-- ---------------------------------------------------------------------------
-- 0. Precondition (before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
begin
  if to_regclass('public.player_invites') is null then
    v_problems := v_problems || 'public.player_invites is missing'::text;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'guardians' and policyname = 'guardians: a parent can link themselves') then
    v_problems := v_problems || 'the guardian self-link policy is still present'::text;
  end if;
  if to_regprocedure('public.coach_assignment_is_active(timestamptz,timestamptz)') is null
     or not has_function_privilege('authenticated', 'public.coach_assignment_is_active(timestamptz,timestamptz)', 'execute') then
    v_problems := v_problems || 'coach_assignment_is_active is not available to policies'::text;
  end if;
  if has_column_privilege('authenticated', 'public.coach_invites', 'used_at', 'insert') then
    v_problems := v_problems || 'coach_invites inserts are not column-limited'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0090 refused: migration 0089 is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1–2. player_invites: only the five columns a legitimate inviter supplies
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.player_invites from anon, authenticated;
grant insert (player_id, code, created_by, invited_email, origin) on public.player_invites to authenticated;

commit;
