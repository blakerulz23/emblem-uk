/**
 * Shared rules for archiving internal test cards out of the staff queues
 * (migration 0088). The database functions are the authority for what may
 * be archived; this module only holds the request-shape rules the routes
 * and the staff UI must agree on.
 */

export const MAX_TEST_ARCHIVE_BATCH = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exact phrase staff must type to archive n cards, e.g. "ARCHIVE 3 TEST CARDS". */
export function archiveConfirmationPhrase(count: number): string {
  return `ARCHIVE ${count} TEST CARD${count === 1 ? '' : 'S'}`;
}

/** The exact phrase staff must type to restore n cards. */
export function restoreConfirmationPhrase(count: number): string {
  return `RESTORE ${count} TEST CARD${count === 1 ? '' : 'S'}`;
}

/** Valid, de-duplicated card ids, or null when the list is empty, malformed or too long. */
export function parseCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((v) => typeof v === 'string' && UUID.test(v))) return null;
  const ids = Array.from(new Set(value as string[]));
  return ids.length <= MAX_TEST_ARCHIVE_BATCH ? ids : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export type TestArchiveResult = { cardId: string; result: 'archived' | 'restored' | 'refused' | 'unchanged'; reason?: string };

/** Staff-facing wording for each refusal the database can return. */
export const TEST_ARCHIVE_REFUSAL_LABELS: Record<string, string> = {
  card_not_found: 'Card not found',
  already_archived: 'Already archived',
  not_archived: 'Not archived',
  card_may_physically_exist: 'Programmed, verified or completed: it may physically exist',
  order_has_payment_evidence: 'Order has payment history: use "Hide refunded test order"',
  squad_invite_payment_recorded: 'Squad Invite payment recorded for this family',
  claimed_by_non_staff_account: 'Claimed by a non-staff account',
};
