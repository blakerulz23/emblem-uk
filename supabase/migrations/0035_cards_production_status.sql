-- Staff-internal production tracking for physical NFC card fulfillment —
-- lives on `cards` (not orders/players) since a card row is already the
-- correct 1:1 unit (one claim_token, one physical chip, one player) and
-- squad orders need independent per-card state, not per-order state.
alter table cards
  add column production_status text not null default 'needs_setup'
    check (production_status in
      ('needs_setup', 'ready_for_programming', 'programmed', 'verified', 'completed')),
  add column production_submitted_at timestamptz,
  add column production_dismissed_at timestamptz;

-- Soft-removal only: Delete on the staff queue sets this and every query
-- filters it out — the row (and its claim_token/player_id/order_id) is
-- never actually deleted. Matches this table's "no destructive writes
-- from a UI action" convention.

-- No new RLS policy: every read/write goes through the service-role
-- client from staff-only API routes, same as every other write to this
-- table. Note for a future author: the existing "cards: visible to
-- guardians/coaches" SELECT policies apply to *all* columns (Postgres RLS
-- has no column-level scoping), so if `cards` is ever queried via the
-- authenticated client instead of service-role, these three columns would
-- be exposed too. Harmless today — every non-service-role touch of
-- `cards` in the app is a SELECT, never used for this data — but worth
-- remembering if that ever changes.

create index idx_cards_production_status on cards (production_status)
  where production_dismissed_at is null;
