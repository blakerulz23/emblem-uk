-- ============================================================================
-- Corrective migration — restricts service_role's table privileges on the
-- three tables migration 0071 created, to exactly what 0071 itself already
-- explicitly intended.
--
-- ROOT CAUSE: this Supabase project's own pg_default_acl for schema public
-- grants the FULL privilege set (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER) to service_role automatically on every new table the
-- `postgres` role creates — independent of, and prior to, any GRANT
-- statement a migration itself writes (confirmed directly via
-- pg_default_acl and has_table_privilege() against production). Migration
-- 0071 revoked the broad default from public/anon/authenticated on all
-- three of its new tables, but never revoked it from service_role — so its
-- own explicit `grant select, insert on builder_authority_audit_events to
-- service_role` was additive on top of an already-present, much broader
-- default grant, not a narrowing of it. The result: service_role could
-- UPDATE and DELETE rows in builder_authority_audit_events, directly
-- contradicting 0071's own documented design ("No UPDATE or DELETE grant
-- exists on this table for any role including service_role — rows are
-- corrected by inserting a new event, never by mutating history").
-- anon/authenticated were never affected — 0071's revoke against them was
-- already sufficient, since the default ACL never granted them anything
-- beyond DELETE/TRUNCATE/REFERENCES/TRIGGER either (Postgres's default
-- privilege model), all of which 0071 already explicitly revoked.
--
-- EVIDENCE FOR THE TARGET PRIVILEGE MATRIX BELOW: every server-side call
-- site referencing these three tables was searched. The only direct
-- (non-RPC) access anywhere in the reviewed application code is one
-- INSERT into builder_authority_audit_events, in the staff order-approve
-- route (src/app/api/orders/[id]/approve/route.ts), when staff attempt to
-- approve an order that is not yet authorised. No other direct `.from(...)`
-- call against any of these three tables exists anywhere in application
-- code — builder_order_authority_declarations and
-- builder_guardian_approval_requests are both accessed exclusively through
-- their SECURITY DEFINER RPCs (record_builder_authority_declaration,
-- link_builder_order_authority, create_builder_guardian_approval_request,
-- respond_to_builder_guardian_approval), which execute with the function
-- owner's privileges regardless of the caller's own table grants — so
-- service_role's raw table grant on those two tables is not exercised by
-- any RPC at all. This migration does not remove 0071's own explicit
-- SELECT/INSERT/UPDATE grant on those two tables, though: 0071's own
-- comment on builder_guardian_approval_requests documents a deliberately
-- scoped-down, not-yet-built staff capability ("A staff member may set
-- status=revoked directly ... no dedicated RPC required for that narrow,
-- rare action") that this SELECT/INSERT/UPDATE grant was provisioned for.
-- Removing an already-reviewed, already-disposable-verified grant that
-- 0071 deliberately made is out of scope for this corrective migration,
-- which exists only to remove the *excess* the default ACL added, not to
-- re-litigate 0071's own design. DELETE was never requested by 0071 for
-- any of the three tables and nothing in application code uses it — it is
-- removed from all three, along with TRUNCATE/REFERENCES/TRIGGER, which
-- 0071 never granted or needed either.
--
-- TARGET MATRIX (service_role):
--   builder_order_authority_declarations : SELECT, INSERT, UPDATE   (matches 0071 exactly)
--   builder_guardian_approval_requests   : SELECT, INSERT, UPDATE   (matches 0071 exactly)
--   builder_authority_audit_events       : SELECT, INSERT           (matches 0071 exactly; append-only is now a real grant property, not just a comment)
--
-- SCOPE: only these three tables' own grants are touched. This migration
-- does not alter this project's schema-wide default ACL (`ALTER DEFAULT
-- PRIVILEGES`) — doing so would affect every future table in the public
-- schema project-wide, a much larger and separately-considered change.
-- Any future migration that creates a new table must explicitly revoke
-- service_role's default privileges down to what it actually needs, the
-- same discipline 0071 already applied for public/anon/authenticated and
-- this migration now applies for service_role too.
--
-- This migration does not modify migration 0071's own file, its recorded
-- history entry, or any of the RLS policies, constraints, indexes, data,
-- or function bodies 0071 created — grants only.
--
-- ROLLBACK (manual, not automated — do not run this reflexively):
--   revoke all on builder_order_authority_declarations from service_role;
--   revoke all on builder_guardian_approval_requests from service_role;
--   revoke all on builder_authority_audit_events from service_role;
--   grant select, insert, update on builder_order_authority_declarations to service_role;
--   grant select, insert, update on builder_guardian_approval_requests to service_role;
--   grant select, insert on builder_authority_audit_events to service_role;
--   -- (this restores this migration's OWN state, i.e. a no-op — there is
--   -- no legitimate reason to roll this migration back to the wider,
--   -- default-ACL-inherited state; if this migration is ever found to be
--   -- wrong, the correct action is a new forward migration with the
--   -- actually-correct grant, not a rollback to the accidental default.)
-- ============================================================================

begin;

revoke all on builder_order_authority_declarations from service_role;
grant select, insert, update on builder_order_authority_declarations to service_role;

revoke all on builder_guardian_approval_requests from service_role;
grant select, insert, update on builder_guardian_approval_requests to service_role;

revoke all on builder_authority_audit_events from service_role;
grant select, insert on builder_authority_audit_events to service_role;

commit;
