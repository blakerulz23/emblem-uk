import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/squad-invites/[id]/coach-card/route.ts', 'utf8');

describe('POST /api/squad-invites/[id]/coach-card — organiser coach-card submission', () => {
  it('checks CSRF, session, rate limit and campaign ownership before accepting anything, same triad as flag-concern', () => {
    const csrfIndex = source.indexOf('hasValidSquadInviteCsrf(request)');
    const authIndex = source.indexOf('createClient().auth.getUser()');
    const rateLimitIndex = source.indexOf("consumeSquadInviteRateLimit(request.headers, 'coach-card-submit', user.id)");
    const ownershipIndex = source.indexOf("eq('organiser_profile_id', user.id)");
    expect(csrfIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(csrfIndex);
    expect(rateLimitIndex).toBeGreaterThan(authIndex);
    expect(ownershipIndex).toBeGreaterThan(rateLimitIndex);
  });

  it('never reuses /api/order-assets — that route has no auth/ownership check at all', () => {
    // Deliberately checks for an actual import/fetch of that route, not the
    // explanatory header comment that names it as the thing NOT to reuse.
    expect(source).not.toMatch(/from ['"].*order-assets['"]|fetch\(['"`].*order-assets/);
  });

  it('builds the S3 key itself from the ownership-checked campaign id, never from a caller-supplied path segment', () => {
    expect(source).toContain('`squad-invite-coach-cards/${campaign.id}/${Date.now()}.${extensionFor(file)}`');
  });

  it('validates content-type and size the same way order-assets does', () => {
    expect(source).toContain("new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])");
    expect(source).toContain('file.size > 18 * 1024 * 1024');
  });

  it('delegates the actual submission to submit_squad_invite_coach_card, never writing the table directly', () => {
    expect(source).toContain("rpc('submit_squad_invite_coach_card'");
    expect(source).not.toMatch(/squad_invite_coach_cards['"]\)\.(insert|update)\(/);
  });

  it('notifies squad_invite_approver staff only after the RPC succeeds, never before, with a date-scoped idempotency key so a resubmission on a later day is a genuinely new notification', () => {
    const rpcIndex = source.indexOf("rpc('submit_squad_invite_coach_card'");
    const notifyIndex = source.indexOf("eventType: 'coach_card_submitted'");
    expect(notifyIndex).toBeGreaterThan(rpcIndex);
    expect(source).toContain("recipientScope: 'squad_invite_approver'");
    expect(source).toMatch(/eventKey: `coach_card_submitted:\$\{campaign\.id\}:\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}`/);
  });
});
