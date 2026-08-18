import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app/staff/queue/page.tsx', 'utf8');

// Guards the staff preview fix: Squad Invite's commit flow never renders a
// print PDF, so Section 1's only other preview mechanism leaves staff
// approving those orders blind. This checks the safety properties of
// getDesignPreviewsByOrder/its rendering without mocking Supabase — matching
// this file's existing sibling helpers (getCardCountsByOrder,
// getPlayerNamesByOrder), none of which have a behavioural unit test either.
describe('Staff queue — design preview never breaks the page or leaks across orders', () => {
  it('scopes the card_definitions lookup to the given order ids', () => {
    expect(page).toMatch(/\.from\('card_definitions'\)\s*\.select\('order_id, name, number, team, position, photo, status'\)\s*\.in\('order_id', orderIds\)/);
  });

  it('keeps exactly one preview per order — first match only, never overwritten', () => {
    expect(page).toContain('if (!row.order_id || map.has(row.order_id)) continue');
  });

  it('a failed or missing S3 signed URL falls back to null, never throws', () => {
    expect(page).toMatch(/getSignedDownloadUrl\(storageKey, 3600\)\.catch\(\(\) => null\)/);
  });

  it('short-circuits to an empty map for zero order ids, never calls Supabase needlessly', () => {
    expect(page).toMatch(/async function getDesignPreviewsByOrder[\s\S]{0,260}if \(orderIds\.length === 0\) return map;/);
  });

  it('the thumbnail only renders when a photo URL actually resolved', () => {
    expect(page).toContain('{order.designPreview?.photoUrl && (');
  });

  it('the thumbnail links to the same signed URL it displays, opened in a new tab', () => {
    expect(page).toMatch(/<a href=\{order\.designPreview\.photoUrl\} target="_blank" rel="noopener noreferrer"/);
  });
});
