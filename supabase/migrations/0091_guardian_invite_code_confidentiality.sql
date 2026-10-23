-- Guardian-invite code confidentiality (applied immediately after 0090, in
-- the same maintenance window).
--
-- Until now an active coach could read every guardian invite (player_invites)
-- for any player on their team, including the code, whoever created it: a
-- guardian's second-guardian invite, an order-approval invite meant for the
-- purchaser, or a recovery handoff meant for the right parent. A coach could
-- therefore pass such a code to another account they control and add a
-- guardian to a child who already has one.
--
-- After 0091 a coach may read only the invites they created themselves
-- (created_by = auth.uid()), and only while their assignment to the player's
-- team is active. Nothing else changes:
--   - guardians keep reading their own child's invites (unchanged policy);
--   - unrelated, ended, expired and direct-only coaches read nothing;
--   - anon holds no privilege on the table (unchanged);
--   - service_role and the trusted server flows (order approval, recovery,
--     resend, redemption, account deletion, child erasure) are unchanged.
-- The invite's origin is not used for authorization.
--
--   0. Precondition: refuses, changing nothing, unless the exact 0090 state
--      is in place (RLS on, the two SELECT policies, the 0090 column grants,
--      no anon access) and this change has not already been made.
--   1. The coach SELECT policy also requires created_by = auth.uid().
--
-- No row, grant, function or other policy changes, and no audit event is
-- written. Rollback: supabase/rollback/0091_rollback.sql (reopens
-- guardian-invite code disclosure).

begin;

-- ---------------------------------------------------------------------------
-- 0. Precondition (before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
  v_coach_qual text;
begin
  if to_regclass('public.player_invites') is null then
    raise exception '0091 refused: public.player_invites is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.player_invites'::regclass) then
    v_problems := v_problems || 'row level security is not enabled on player_invites'::text;
  end if;
  -- 0090: authenticated inserts only the five inviter columns.
  if not has_column_privilege('authenticated', 'public.player_invites', 'code', 'insert')
     or has_column_privilege('authenticated', 'public.player_invites', 'used_at', 'insert')
     or has_column_privilege('authenticated', 'public.player_invites', 'order_id', 'insert')
     or has_table_privilege('authenticated', 'public.player_invites', 'update')
     or has_table_privilege('authenticated', 'public.player_invites', 'delete') then
    v_problems := v_problems || 'the 0090 player_invites write lockdown is not in place'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.player_invites', 'select') then
    v_problems := v_problems || 'authenticated cannot select player_invites'::text;
  end if;
  if has_table_privilege('anon', 'public.player_invites', 'select') then
    v_problems := v_problems || 'anon can select player_invites'::text;
  end if;
  -- Exactly the two expected SELECT policies, and nothing else that reads.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'player_invites' and cmd in ('SELECT', 'ALL')) <> 2 then
    v_problems := v_problems || 'player_invites does not have exactly the two expected SELECT policies'::text;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_invites'
                 and policyname = 'player_invites: guardians can view/create for their player' and cmd = 'SELECT') then
    v_problems := v_problems || 'the guardian SELECT policy is missing'::text;
  end if;
  select qual into v_coach_qual from pg_policies where schemaname = 'public' and tablename = 'player_invites'
    and policyname = 'player_invites: coaches can view/create for their team' and cmd = 'SELECT';
  if v_coach_qual is null then
    v_problems := v_problems || 'the coach SELECT policy is missing'::text;
  elsif v_coach_qual not like '%coach_assignment_is_active%' or v_coach_qual not like '%player_invites.player_id%' then
    v_problems := v_problems || 'the coach SELECT policy is not the 0089 active-assignment policy'::text;
  elsif v_coach_qual like '%created_by%' then
    v_problems := v_problems || 'the coach SELECT policy already requires created_by (0091 already applied)'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0091 refused: the expected 0090 state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Coaches read only the invites they created
-- ---------------------------------------------------------------------------
alter policy "player_invites: coaches can view/create for their team" on public.player_invites
  using (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))));

commit;
