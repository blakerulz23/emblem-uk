-- Reverts 0058's flip. 0058's own comment argued this was safe because
-- isSquadInviteMvpEnabled()'s separate hardcoded production check would
-- keep Squad Invite dark in production regardless — but that check was
-- since removed (2026-08-18, DPIA approved) without anyone revisiting
-- this function, so a real production "Approve for pilot production"
-- click failed with "Payment is required before this can be approved for
-- production" — nothing in Squad Invite has ever marked an order 'paid'
-- (no real Shopify payment integration exists for this feature), so with
-- this function returning true, literally no order could ever be
-- approved, on either environment. The pilot runbook
-- (docs/pilot/squad-invite-controlled-pilot-runbook.md) has described
-- payment mode as "hardcoded false for the entire pilot" this whole time
-- and was never updated when 0058 landed — this migration makes the code
-- match that doc again, restoring the unpaid-pilot approval flow
-- (audit metadata paymentStatus: 'unpaid_pilot') that's actually built
-- and tested throughout this feature.
create or replace function public.squad_invite_payment_mode_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$ select false; $$;

alter function public.squad_invite_payment_mode_enabled() owner to postgres;
revoke all on function public.squad_invite_payment_mode_enabled() from public, anon, authenticated;
grant execute on function public.squad_invite_payment_mode_enabled() to service_role;

comment on function public.squad_invite_payment_mode_enabled() is
  'Server-only policy boundary for Squad Invite payment mode. Reverted to false by this migration (0064) after 0058''s flip left production unable to approve any order (2026-08-18 incident) — reverting again requires another reviewed migration, never a runtime env var or client-supplied value.';
