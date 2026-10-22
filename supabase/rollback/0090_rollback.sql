-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK REOPENS GUARDIAN-INVITE FORGERY.
-- ============================================================================
-- Reverses 0090_guardian_invite_write_lockdown.sql, returning player_invites
-- privileges to exactly their 0089 state. Once it runs, any signed-in
-- guardian of a player, or active coach of the player's team, can again
-- insert guardian invites with forged status and attribution fields:
-- used_at, used_by, created_at, expires_at, order_id, email_status and the
-- id. Such a row can look already consumed by someone else, backdated, never
-- expiring, or tied to an order. Prefer fixing forward. Use this only if a
-- legitimate flow is broken by 0090 and cannot be fixed quickly, and
-- re-apply 0090 as soon as possible.
--
-- It refuses to run, changing nothing, unless the SAME TRANSACTION first
-- sets this exact acknowledgement, transaction-local (third argument true):
--
--   begin;
--   select set_config('emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY', true);
--   -- then this file, in the same transaction
--
-- (This file's own begin is then a no-op and its commit commits.) The file
-- also clears the acknowledgement before committing, so it never outlives
-- the transaction.
--
-- Data: lossless. 0090 changed only privileges; this restores them. No row
-- is created, changed or deleted.
begin;

do $$
begin
  if current_setting('emblem.acknowledge_0090_rollback', true) is distinct from 'REOPEN-GUARDIAN-INVITE-FORGERY' then
    raise exception '0090 rollback refused: it reopens guardian-invite forgery. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0090_rollback'', ''REOPEN-GUARDIAN-INVITE-FORGERY'', true);';
  end if;
end;
$$;

-- 2 reversed: the five column grants (a table-level grant would leave them behind).
revoke insert (player_id, code, created_by, invited_email, origin) on public.player_invites from authenticated;
-- 1 reversed: table-level INSERT for authenticated, as at 0089. anon and
-- authenticated held no UPDATE or DELETE at 0089, so nothing else returns.
grant insert on public.player_invites to authenticated;

-- Never let the acknowledgement outlive this transaction.
select set_config('emblem.acknowledge_0090_rollback', '', false);

commit;
