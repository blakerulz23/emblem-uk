-- Purpose: lets an organiser flag a name shown on their own "Squad progress"
-- dashboard (see CampaignDashboard.tsx) as one they don't recognise —
-- the real-world, club-mediated check behind the bounded first-name +
-- surname-initial list added there. Reuses the existing append-only audit
-- log rather than a new table; the CHECK constraint on event_type was the
-- only thing missing.
--
-- The accompanying application work lives alongside this migration in the
-- same change: POST /api/squad-invites/[id]/flag-concern (organiser-
-- authenticated, ownership-checked, CSRF-protected, rate-limited under the
-- 'concern-flag' action in squad-invite-rate-limit.ts) inserts one row here
-- with actor_role='organiser' and a short free-text note in metadata; the
-- staff detail page's existing "Audit history" section renders that
-- metadata for this event_type specifically.

alter table public.squad_invite_request_audit_events
  drop constraint squad_invite_request_audit_events_event_type_check,
  add constraint squad_invite_request_audit_events_event_type_check
    check (event_type = any (array[
      'submitted', 'review_started', 'changes_requested', 'resubmitted',
      'approved', 'rejected', 'approval_cancelled', 'notification_resend_prepared',
      'organiser_flagged_concern'
    ]));
