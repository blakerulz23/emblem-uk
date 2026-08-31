import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/staff/cards/[id]/send-claim-reminder/route.ts', 'utf8');

describe('POST /api/staff/cards/[id]/send-claim-reminder', () => {
  it('requires generic staff (requireStaff), not a Squad-Invite-specific permission — this is a cards action, matching submit/reject', () => {
    expect(source).toContain('requireStaff(createClient())');
    expect(source).not.toContain('requireSquadInvitePermission');
  });

  it('quietly skips an already-claimed card rather than erroring — nothing is actually wrong, just nothing left to send', () => {
    expect(source).toContain("if (card.status === 'claimed') return NextResponse.json({ ok: true, skipped: 'already_claimed' });");
    expect(source).not.toMatch(/status:\s*400[^;]*already been claimed/i);
  });

  it('is scoped to Squad Invite orders only, never touching the normal-order invite flow', () => {
    expect(source).toContain("order.source !== 'squad_invite'");
    expect(source).toContain("'This action is only available for Squad Invite cards'");
  });

  it('builds the claim URL from the real NFC link helper, not a hand-rolled one', () => {
    expect(source).toContain('buildNfcCardUrl(card.claim_token)');
  });

  it('only records claim_reminder_sent_at after a genuinely successful send', () => {
    const sendIndex = source.indexOf('sendSquadInviteCardClaimReminderEmail(');
    const updateIndex = source.indexOf("update({ claim_reminder_sent_at:");
    expect(sendIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(sendIndex);
    expect(source).toContain('if (!ok) return NextResponse.json');
  });
});
