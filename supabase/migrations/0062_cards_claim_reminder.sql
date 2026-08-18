-- Tracks whether/when staff sent a Squad Invite guardian a reminder to
-- tap/claim their child's card (see send-claim-reminder/route.ts). Plain
-- nullable column, no RPC — cards already gets direct service-role
-- UPDATE (see src/app/api/staff/cards/[id]/submit/route.ts and
-- .../reject/route.ts), unlike the more locked-down squad_invite_* tables.
alter table public.cards add column claim_reminder_sent_at timestamptz;
