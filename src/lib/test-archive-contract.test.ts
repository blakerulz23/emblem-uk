import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { archiveConfirmationPhrase, MAX_TEST_ARCHIVE_BATCH, parseCardIds, restoreConfirmationPhrase } from './test-archive';

/**
 * Archiving internal test cards must never destroy or alter financial or
 * audit history, and archived cards must leave every operational queue.
 * These pin the migration's guard rails and the queue filters, so a later
 * change to either fails here rather than in production.
 */
const migration = readFileSync('supabase/migrations/0088_test_card_archive.sql', 'utf8');
const fn = (name: string) => {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return migration.slice(start, migration.indexOf('$$;', start));
};

describe('test-archive request rules', () => {
  it('builds the exact confirmation phrases', () => {
    expect(archiveConfirmationPhrase(1)).toBe('ARCHIVE 1 TEST CARD');
    expect(archiveConfirmationPhrase(12)).toBe('ARCHIVE 12 TEST CARDS');
    expect(restoreConfirmationPhrase(3)).toBe('RESTORE 3 TEST CARDS');
  });

  it('accepts 1–100 valid unique ids only', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseCardIds([id, id])).toEqual([id]);
    expect(parseCardIds([])).toBeNull();
    expect(parseCardIds(['nope'])).toBeNull();
    expect(parseCardIds('x')).toBeNull();
    expect(MAX_TEST_ARCHIVE_BATCH).toBe(100);
  });
});

describe('migration 0088: soft, audited and never touches financial history', () => {
  it('deletes, drops or truncates nothing', () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/grant[^;]*\bdelete\b/i);
  });

  it('never writes payment columns or payment, webhook or Squad Invite tables', () => {
    expect(migration).not.toMatch(/update\s+public\.(payment_state_events|shopify_webhook_events|squad_invite_participations|squad_invites|squad_invite_audit_events)\b/i);
    for (const block of migration.match(/update public\.orders[\s\S]*?;/gi) ?? []) {
      expect(block).not.toMatch(/payment_status|paid_at|paid_amount_pence|paid_currency|shopify_order_id|approved_at/);
      expect(block).toMatch(/is_internal_test/);
    }
  });

  it('the audit table is append-only for the service role', () => {
    expect(migration).toMatch(/revoke all on public\.test_archive_audit_events from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant select, insert on public\.test_archive_audit_events to service_role;/);
  });

  it('every archive, restore and hide function checks test_data_admin itself and is service-role only', () => {
    for (const name of ['archive_test_cards', 'restore_test_cards', 'hide_financial_test_order']) {
      expect(fn(name)).toMatch(/if not public\.has_test_data_admin\(p_actor\) then raise exception/);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it('archive_test_cards refuses payment history, physical cards, non-staff claims and paid Squad Invite families, and audits refusals', () => {
    const archive = fn('archive_test_cards');
    expect(archive).toMatch(/production_status in \('programmed', 'verified', 'completed'\)/);
    expect(archive).toMatch(/payment_status in \('paid', 'refunded'\)/);
    expect(archive).toMatch(/paid_at is not null/);
    expect(archive).toMatch(/shopify_order_id is not null/);
    expect(archive).toMatch(/paid_amount_pence is not null/);
    expect(archive).toMatch(/from public\.payment_state_events/);
    expect(archive).toMatch(/from public\.shopify_webhook_events/);
    expect(archive).toMatch(/status in \('paid', 'refunded', 'production_accepted'\)/);
    expect(archive).toMatch(/claimed_by_non_staff_account/);
    expect(archive).toMatch(/values \('refused'/);
    expect(archive).toMatch(/values \('archived'/);
    expect(archive).toMatch(/cardinality\(p_card_ids\) > 100/);
  });

  it('hide_financial_test_order only accepts refunded or cancelled orders with the typed reference, and audits', () => {
    const hide = fn('hide_financial_test_order');
    expect(hide).toMatch(/payment_status not in \('refunded', 'cancelled'\)/);
    expect(hide).toMatch(/typed order reference does not match/);
    expect(hide).toMatch(/production_status in \('programmed', 'verified', 'completed'\)/);
    expect(hide).toMatch(/values \('hidden_financial_test'/);
  });

  it('restore clears the flags and audits', () => {
    const restore = fn('restore_test_cards');
    expect(restore).toMatch(/archived_as_test_at = null/);
    expect(restore).toMatch(/values \('restored'/);
  });
});

describe('archived test records leave every operational queue', () => {
  const queue = readFileSync('src/app/staff/queue/page.tsx', 'utf8');

  it('the production list excludes archived cards and every order list excludes internal-test orders', () => {
    expect(queue).toMatch(/\.is\('production_dismissed_at', null\)\s*\.is\('archived_as_test_at', null\)/);
    expect((queue.match(/\.eq\('is_internal_test', false\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('an archived card cannot be sent to programming, and an archived order cannot be approved', () => {
    expect(readFileSync('src/app/api/staff/cards/[id]/submit/route.ts', 'utf8')).toMatch(/\.is\('archived_as_test_at', null\)/);
    const approve = readFileSync('src/app/api/orders/[id]/approve/route.ts', 'utf8');
    expect(approve).toMatch(/is_internal_test === true/);
    expect(approve).toMatch(/status: 409/);
  });
});
