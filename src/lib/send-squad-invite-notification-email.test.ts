import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInviteNotificationEmail } from './send-squad-invite-notification-email';

const ORIGINAL_ENV = { ...process.env };

describe('sendSquadInviteNotificationEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendSquadInviteNotificationEmail({
      toEmail: 'organiser@example.org', template: 'request_received', teamName: 'Test FC', publicReference: 'SI-TEST',
    });
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never includes an invitation-link path or token in the approved_link_ready email — that link does not exist yet at approval time', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInviteNotificationEmail({
      toEmail: 'organiser@example.org', template: 'approved_link_ready', teamName: 'Test FC', publicReference: 'SI-TEST',
    });
    expect(capturedBody.html).not.toMatch(/squad-invite\/access#token=/);
    expect(capturedBody.html).not.toMatch(/[a-f0-9]{40,}/i); // no hash/token-shaped string
    expect(capturedBody.html).toContain('/squad-invite/manage/SI-TEST');
  });

  it('escapes an organiser-visible reason before embedding it in the email body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInviteNotificationEmail({
      toEmail: 'organiser@example.org', template: 'changes_requested', teamName: 'Test FC', publicReference: 'SI-TEST',
      reason: '<script>alert(1)</script>',
    });
    expect(capturedBody.html).not.toContain('<script>alert(1)</script>');
    expect(capturedBody.html).toContain('&lt;script&gt;');
  });

  it('returns ok:false, never throws, when the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const result = await sendSquadInviteNotificationEmail({
      toEmail: 'organiser@example.org', template: 'rejected', teamName: 'Test FC', publicReference: 'SI-TEST', reason: 'Duplicate club',
    });
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false, never throws, when fetch itself throws (network failure)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await sendSquadInviteNotificationEmail({
      toEmail: 'organiser@example.org', template: 'request_received', teamName: 'Test FC', publicReference: 'SI-TEST',
    });
    expect(result).toEqual({ ok: false });
  });
});
