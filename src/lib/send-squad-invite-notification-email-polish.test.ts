import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInviteNotificationEmail } from './send-squad-invite-notification-email';

const ORIGINAL_ENV = { ...process.env };

async function capture(template: 'request_received' | 'changes_requested' | 'approved_link_ready' | 'rejected', extra: Record<string, unknown> = {}) {
  process.env.RESEND_API_KEY = 'test-key';
  let capturedBody: { subject?: string; html?: string; text?: string } = {};
  vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    capturedBody = JSON.parse(String((init as RequestInit).body));
    return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
  });
  await sendSquadInviteNotificationEmail({
    toEmail: 'organiser@example.org', template, teamName: 'Ashton Juniors U10', publicReference: 'SI-TEST1234', ...extra,
  });
  return capturedBody;
}

// This is a genuine application lifecycle email sent directly via Resend's
// HTTP API from dispatch-squad-invite-notification.ts, not a Supabase Auth
// template — confirmed by reading both files before editing. This suite
// guards the content polish (plain-text parity, reference number, clearer
// next-step copy) without weakening the existing safety contracts already
// covered by send-squad-invite-notification-email.test.ts (no invitation
// token/credential, escaped organiser-visible reasons).
describe('Squad Invite lifecycle emails — content polish', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

  it('every template now sends a plain-text body alongside the HTML one', async () => {
    for (const template of ['request_received', 'changes_requested', 'approved_link_ready', 'rejected'] as const) {
      const body = await capture(template, template === 'changes_requested' || template === 'rejected' ? { reason: 'Duplicate club name' } : {});
      expect(typeof body.text).toBe('string');
      expect((body.text ?? '').length).toBeGreaterThan(0);
    }
  });

  it('the request-received email states the reference, the review expectation and what happens after approval, in both formats', async () => {
    const body = await capture('request_received');
    for (const text of [body.html, body.text]) {
      expect(text).toContain('SI-TEST1234');
      expect(text).toContain('within two business days');
      expect(text).toContain('sign in to add delivery details and receive the link to share with parents');
    }
  });

  it('the request-received email never promises a stronger timescale than the existing two-business-day policy', async () => {
    const body = await capture('request_received');
    expect(body.html).not.toMatch(/as soon as possible|immediately|within \d+ hours?/i);
  });

  it('the approved email uses the requested subject, a distinct CTA label, and explains delivery-setup-before-link', async () => {
    const body = await capture('approved_link_ready');
    expect(body.subject).toBe('Your Squad Invite for Ashton Juniors U10 has been approved');
    for (const text of [body.html, body.text]) {
      expect(text).toContain('Complete setup and get your parent link');
      expect(text).toContain('SI-TEST1234');
      expect(text).toMatch(/delivery setup/i);
      expect(text).toContain("weren't expecting this email");
    }
  });

  it('the approved email still never includes an invitation token or link in either format', async () => {
    const body = await capture('approved_link_ready');
    for (const text of [body.html, body.text]) {
      expect(text).not.toMatch(/squad-invite\/access#token=/);
      expect(text).not.toMatch(/[a-f0-9]{40,}/i);
    }
  });
});
