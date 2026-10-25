-- Narrows service_role on the UK partner tables (0095) to what the app uses.
--
-- 0095 revoked everything from public/anon/authenticated and granted
-- service_role select/insert/update, but Supabase's default privileges had
-- already given service_role ALL on every new public table, so it also
-- held DELETE, TRUNCATE, REFERENCES and TRIGGER on all four tables, and
-- INSERT on partner_commissions. Same pattern 0037 fixed for the core
-- tables.
--
-- After this, service_role (the app) has exactly:
--   partners, partner_codes, partner_payouts: SELECT, INSERT, UPDATE
--   partner_commissions: SELECT only. Commissions are written solely by the
--     security-definer functions below, which run as their owner and are
--     unaffected by these table privileges.
-- and EXECUTE on the three intended functions (re-stated here, unchanged
-- from 0095). The two payout-integrity functions stay non-executable by
-- every API role, as 0095 left them.
--
-- Nothing in the app deletes partner data; retention clean-up is manual, by
-- the database owner (docs/partner-data-retention.md).
--
-- Privileges only: no table, row, function body, trigger or policy changes.
-- Safe to apply before or after the app deploy, and safe to re-run.

begin;

revoke all on public.partners, public.partner_codes, public.partner_payouts, public.partner_commissions from service_role;
grant select, insert, update on public.partners, public.partner_codes, public.partner_payouts to service_role;
grant select on public.partner_commissions to service_role;

grant execute on function public.record_uk_partner_commission(uuid, text, integer) to service_role;
grant execute on function public.void_uk_partner_commission(uuid, text) to service_role;
grant execute on function public.create_uk_partner_payout(uuid, uuid) to service_role;

commit;
