-- Emblem OS — moderation gate
--
-- Closes the "No moderation before a child's photo is 'live'" HIGH-severity
-- finding from the engineering audit. Prior state: any parent-submitted
-- moment landed in the collection immediately; the Verify screen's
-- approve/reject was purely cosmetic.
--
-- New behaviour: parent-submitted moments start in status='pending' and
-- must be approved by a coach on the player's team before they carry the
-- Verified badge. Coach-submitted recognitions bypass this — a coach's
-- own action is already the verification step for those.
--
-- IMPORTANT: run this AFTER 0001_init.sql and 0002_grants.sql.

alter table moments
  add column status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));

-- Existing rows (from the pre-moderation era) get retroactively marked
-- approved so we don't hide history behind a review queue that never ran.
-- Fresh production databases will have zero rows and this is a no-op.
update moments set status = 'approved' where verified_at is not null;
update moments
  set status = 'approved'
  where status = 'pending' and created_at < now() - interval '1 hour';

-- Index for the CoachVerify screen's "pending moments on my teams" query.
create index idx_moments_status_player on moments (status, player_id);

-- The existing SELECT policy already restricts to guardians and assigned
-- coaches, so pending moments are private by default — no policy change
-- needed. Guardians see their own pending moments (with a "pending review"
-- UI tag) so they can chase the coach; coaches see only their assigned
-- team's pending moments in the Verify queue.
