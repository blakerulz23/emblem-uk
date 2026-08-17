-- Flips the Squad Invite payment wall from false to true.
--
-- This is the deliberate, separately-reviewed migration that
-- squad_invite_payment_mode_enabled()'s own original comment (0055) said
-- would be required — never a runtime env var, request header or
-- client-supplied flag. This is that migration, and nothing else: same
-- function signature, same grants, same stable/security posture, only the
-- return value changes.
--
-- IMPORTANT — this alone does not make Squad Invite live for real users.
-- src/lib/squad-invite-mvp.ts's isSquadInviteMvpEnabled() has its own,
-- separate hardcoded check that returns false whenever
-- process.env.VERCEL_ENV === 'production', regardless of this function or
-- any env var. That block was put there specifically pending the
-- children's DPIA (docs/compliance/childrens-dpia-v0.1.md), which remains
-- paused as of this migration. Flipping this wall only affects
-- environments where Squad Invite can already run at all — today, that
-- means disposable and staging, not production.
--
-- Once flipped: /api/orders/[id]/approve requires payment_status='paid'
-- before approving a squad_invite order for production (see that route's
-- own comment), and the finalise-pricing route
-- (/api/staff/squad-invites/[id]/finalise-pricing) begins genuinely
-- issuing payment requests instead of no-op'ing paymentRequestsEnabled to
-- false — both already built to respect this exact function, unchanged
-- by this migration.

create or replace function public.squad_invite_payment_mode_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$ select true; $$;

alter function public.squad_invite_payment_mode_enabled() owner to postgres;
revoke all on function public.squad_invite_payment_mode_enabled() from public, anon, authenticated;
grant execute on function public.squad_invite_payment_mode_enabled() to service_role;

comment on function public.squad_invite_payment_mode_enabled() is
  'Server-only policy boundary for Squad Invite payment mode. Flipped to true by this migration (0058) — reverting requires another reviewed migration, never a runtime env var or client-supplied value. Squad Invite remains blocked in production regardless of this value by a separate hardcoded check in isSquadInviteMvpEnabled(), pending the children''s DPIA.';
