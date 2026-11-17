-- Restore Squad Invite audit event types dropped by migration 0081.
--
-- 0081 rebuilt squad_invite_audit_events_event_type_check from 0057's list
-- plus 'payment_preview_opened', silently dropping five values that later
-- migrations had added and still write:
--   0059: 'coach_card_submitted', 'coach_card_locked', 'coach_card_changes_requested'
--   0063: 'photo_rejected'
--   0066: 'campaign_reopened'
-- Any function that inserts one of those events (submit/lock/request-changes
-- on a coach card, staff photo rejection, organiser re-open) therefore fails
-- the check constraint once 0081 is applied.
--
-- This migration only widens the constraint back to the union of every
-- value ever allowed. It removes nothing, touches no rows and changes no
-- function. Safe to apply on its own, ahead of any feature work.

alter table public.squad_invite_audit_events
  drop constraint squad_invite_audit_events_event_type_check,
  add constraint squad_invite_audit_events_event_type_check
    check (event_type = any (array[
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested',
      'coach_card_submitted','coach_card_locked','coach_card_changes_requested',
      'photo_rejected',
      'campaign_reopened',
      'payment_preview_opened'
    ]));

-- Verification (read-only), run before and after applying:
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'squad_invite_audit_events_event_type_check';
-- Rollback: not required (widening only). Re-applying 0081's narrower list
-- would re-break the five event writers above.
