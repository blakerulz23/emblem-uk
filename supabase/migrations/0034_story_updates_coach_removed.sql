-- Adds coach_removed to story_updates' event_type check constraint —
-- coach_connected already exists and is reused as-is (0025_story_updates.sql)
-- for a direct coach's successful redemption; there was never an event
-- for a coach connection ENDING (guardian revoke or coach leave), and
-- Milestone 6 needs one. Same drop/recreate-the-constraint shape this
-- codebase already uses for widening a check constraint (see the
-- create_season_focus function redefinition in
-- 0032_widen_coach_authorization.sql for the equivalent pattern applied
-- to a function body instead of a table constraint).
alter table story_updates drop constraint story_updates_event_type_check;
alter table story_updates add constraint story_updates_event_type_check
  check (event_type in (
    'assessment_shared','recognition','moment_verified','season_focus_added',
    'coach_connected','moment_uploaded','verification_required','guardian_connected',
    'coach_removed'
  ));
