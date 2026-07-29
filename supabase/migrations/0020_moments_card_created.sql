-- Milestone 4B — seed Collection from Builder. A card_created moment is a
-- real, system-generated fact ("this card came to life"), not a
-- user-submitted memory — distinguished by `source`, never by overloading
-- trust/verification_status with a claim about a human verifier who was
-- never involved.
alter table moments add column card_definition_id uuid references card_definitions (id) on delete set null;
alter table moments add column source text not null default 'submission' check (source in ('submission', 'system'));

-- Idempotency at the database level, not just app-level check-then-insert:
-- at most one system-generated moment per Card Definition, ever — a
-- repeated or concurrent approval call can never create a duplicate.
create unique index moments_one_system_moment_per_definition
  on moments (card_definition_id)
  where source = 'system';

-- A card_created moment is certain the instant the card exists — there is
-- no human verifier to name, so it gets its own honest status rather than
-- a fabricated coach_verified/family_memory claim.
--
-- NOTE: this assumes the base verification_status CHECK constraint still
-- carries Postgres's default auto-generated name from when it was first
-- added via a single `ADD COLUMN ... CHECK(...)` statement in migration
-- 0011 (moments_verification_status_check). If this DROP fails, query
-- information_schema.check_constraints for the real name and adjust
-- before re-running.
alter table moments drop constraint moments_verification_status_check;
alter table moments add constraint moments_verification_status_check
  check (verification_status in ('family_memory', 'pending_verification', 'coach_verified', 'system_generated'));

alter table moments drop constraint moments_verification_status_consistency;
alter table moments add constraint moments_verification_status_consistency
  check (
    (verification_status = 'coach_verified' and verified_at is not null and verified_by is not null)
    or
    (verification_status in ('family_memory', 'pending_verification', 'system_generated') and verified_at is null and verified_by is null)
  );

-- One-time backfill: every already-approved Card Definition that doesn't
-- yet have its card_created moment. Uses the real card_definitions.created_at
-- as occurred_on (never "today") so it buckets into whichever season was
-- actually active back then, not a fabricated recent date. Safe to re-run —
-- the partial unique index above makes a repeat run a no-op.
insert into moments (player_id, title, occurred_on, trust, verification_status, card_definition_id, source)
select cd.player_id, 'Card Created', cd.created_at::date, 'club', 'system_generated', cd.id, 'system'
from card_definitions cd
where cd.status = 'approved'
  and cd.player_id is not null
  and not exists (
    select 1 from moments m where m.card_definition_id = cd.id and m.source = 'system'
  )
on conflict (card_definition_id) where source = 'system' do nothing;
