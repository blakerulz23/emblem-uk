import { describe, expect, it } from 'vitest';
import { guardianInviteOutcome, INVITE_NOT_EMAILED_RETRY_COPY, INVITE_NOT_EMAILED_SHARE_COPY, INVITE_SENT_COPY } from './guardian-invite-outcome';

describe('guardianInviteOutcome — the screen says "sent" only when it was', () => {
  it('sent', () => {
    expect(guardianInviteOutcome('sent', { canShareLink: true })).toEqual({ emailed: true, message: 'Invitation sent.' });
  });

  it('failed or skipped, where the link can be shared', () => {
    for (const s of ['failed', 'skipped_no_email', undefined] as const) {
      expect(guardianInviteOutcome(s, { canShareLink: true })).toEqual({ emailed: false, message: INVITE_NOT_EMAILED_SHARE_COPY });
    }
    expect(INVITE_NOT_EMAILED_SHARE_COPY).toBe('Invitation created, but the email could not be sent. You can share the invitation link directly.');
  });

  it('failed, where the sender cannot see the link (a card handoff): suggests retrying', () => {
    expect(guardianInviteOutcome('failed', { canShareLink: false })).toEqual({ emailed: false, message: INVITE_NOT_EMAILED_RETRY_COPY });
  });

  it('no not-emailed message ever claims the email was sent', () => {
    for (const m of [INVITE_NOT_EMAILED_SHARE_COPY, INVITE_NOT_EMAILED_RETRY_COPY]) {
      expect(m).toContain('could not be sent');
      expect(m).not.toMatch(/\bsent\.$|Invitation sent/);
    }
    expect(INVITE_SENT_COPY).toBe('Invitation sent.');
  });
});
