-- PLANNED, NOT APPLIED. Written for review — not run against any database
-- (disposable, staging or production) as part of this change.
--
-- Purpose: lets an organiser flag a name shown on their own "Squad progress"
-- dashboard (see CampaignDashboard.tsx) as one they don't recognise —
-- the real-world, club-mediated check behind the bounded first-name +
-- surname-initial list added there. Reuses the existing append-only audit
-- log rather than a new table; the CHECK constraint on event_type is the
-- only thing currently missing.
--
-- Once applied, the accompanying application work still needed is:
--   1. POST /api/squad-invites/[id]/flag-concern — organiser-authenticated,
--      ownership-checked (same pattern as the dashboard route), CSRF
--      protected, rate-limited (a new 'concern-flag' action alongside the
--      existing ones in squad-invite-rate-limit.ts), inserting one row here
--      with actor_role='organiser' and a short free-text note in metadata.
--   2. Render metadata on the staff detail page's existing "Audit history"
--      section for this event_type specifically — today that section only
--      ever prints event_type + actor_role, never metadata content.
-- Neither of those is applied by this file; this is the schema step alone.

alter table public.squad_invite_request_audit_events
  drop constraint squad_invite_request_audit_events_event_type_check,
  add constraint squad_invite_request_audit_events_event_type_check
    check (event_type = any (array[
      'submitted', 'review_started', 'changes_requested', 'resubmitted',
      'approved', 'rejected', 'approval_cancelled', 'notification_resend_prepared',
      'organiser_flagged_concern'
    ]));
