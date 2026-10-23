-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK REOPENS GUARDIAN-INVITE CODE DISCLOSURE AND RELAY.
-- ============================================================================
-- Reverses 0091_guardian_invite_code_confidentiality.sql, returning the coach
-- SELECT policy on player_invites to exactly its 0090 state. Once it runs,
-- any active coach can again read every guardian invite, including its code,
-- for any player on their team, whoever created it: a guardian's
-- second-guardian invite, an order-approval invite or a recovery handoff.
-- A coach could then pass such a code to another account they control and
-- add a guardian to a child who already has one. Prefer fixing forward. Use
-- this only if a legitimate flow is broken by 0091 and cannot be fixed
-- quickly, and re-apply 0091 as soon as possible.
--
-- It refuses to run, changing nothing, unless the SAME TRANSACTION first
-- sets this exact acknowledgement, transaction-local (third argument true):
--
--   begin;
--   select set_config('emblem.acknowledge_0091_rollback', 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE', true);
--   -- then this file, in the same transaction
--
-- (This file's own begin is then a no-op and its commit commits.) The file
-- also clears the acknowledgement before committing, so it never outlives
-- the transaction.
--
-- Data: lossless. 0091 changed only one policy; this restores it. No row is
-- created, changed or deleted.
begin;

do $$
begin
  if current_setting('emblem.acknowledge_0091_rollback', true) is distinct from 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE' then
    raise exception '0091 rollback refused: it reopens guardian-invite code disclosure and relay. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0091_rollback'', ''REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE'', true);';
  end if;
end;
$$;

-- 1 reversed: the 0089/0090 coach SELECT policy, exactly.
alter policy "player_invites: coaches can view/create for their team" on public.player_invites
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

-- Never let the acknowledgement outlive this transaction.
select set_config('emblem.acknowledge_0091_rollback', '', false);

commit;
