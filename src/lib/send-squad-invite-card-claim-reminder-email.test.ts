import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInviteCardClaimReminderEmail } from './send-squad-invite-card-claim-reminder-email';

const ORIGINAL_ENV = { ...process.env };

describe('sendSquadInviteCardClaimReminderEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: 'Ashton Juniors U10', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends both HTML and text bodies, and the claim URL appears in both', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    const result = await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: 'Ashton Juniors U10', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(result).toEqual({ ok: true });
    expect(capturedBody.subject).toContain('Ashton Juniors U10');
    expect(capturedBody.html).toContain('https://emblem-uk.example/os?card=abc123');
    expect(capturedBody.text).toContain('https://emblem-uk.example/os?card=abc123');
    expect(typeof capturedBody.text).toBe('string');
    expect((capturedBody.text ?? '').length).toBeGreaterThan(0);
  });

  it('never mentions payment — this email is unrelated to the payment flow', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: 'Ashton Juniors U10', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(capturedBody.html).not.toMatch(/pay(s|ment)?/i);
    expect(capturedBody.text).not.toMatch(/pay(s|ment)?/i);
  });

  it('escapes the team name before embedding it in the HTML body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: '<script>alert(1)</script>', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(capturedBody.html).not.toContain('<script>alert(1)</script>');
    expect(capturedBody.html).toContain('&lt;script&gt;');
  });

  it('returns ok:false, never throws, when the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const result = await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: 'Ashton Juniors U10', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false, never throws, when fetch itself throws (network failure)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await sendSquadInviteCardClaimReminderEmail({
      toEmail: 'guardian@example.org', teamName: 'Ashton Juniors U10', claimUrl: 'https://emblem-uk.example/os?card=abc123',
    });
    expect(result).toEqual({ ok: false });
  });
});
