import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendStaffNotificationEmail } from './send-staff-notification-email';

const ORIGINAL_ENV = { ...process.env };

describe('sendStaffNotificationEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when there are no resolved recipients', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendStaffNotificationEmail({ toEmails: [], eventType: 'organiser_concern_flagged', summary: {}, linkPath: '/staff/squad-invites' });
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops safely when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendStaffNotificationEmail({ toEmails: ['staff@example.test'], eventType: 'organiser_concern_flagged', summary: {}, linkPath: '/staff/squad-invites' });
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends to every resolved recipient in one call, with a human label and the summary rendered', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { to?: string[]; subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    const result = await sendStaffNotificationEmail({
      toEmails: ['a@example.test', 'b@example.test'],
      eventType: 'organiser_concern_flagged',
      summary: { teamName: 'Ashton Juniors U10', reference: 'SI-ABCD1234EF' },
      linkPath: '/staff/squad-invites/SI-ABCD1234EF',
    });
    expect(result).toEqual({ ok: true });
    expect(capturedBody.to).toEqual(['a@example.test', 'b@example.test']);
    expect(capturedBody.subject).toContain('Organiser flagged a concern');
    expect(capturedBody.html).toContain('Ashton Juniors U10');
    expect(capturedBody.html).toContain('SI-ABCD1234EF');
    expect(capturedBody.text).toContain('Ashton Juniors U10');
  });

  it('links back to the staff dashboard using the configured site URL', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://emblem-uk.example';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendStaffNotificationEmail({ toEmails: ['a@example.test'], eventType: 'deletion_request_filed', summary: {}, linkPath: '/staff/deletion-requests' });
    expect(capturedBody.html).toContain('https://emblem-uk.example/staff/deletion-requests');
    expect(capturedBody.text).toContain('https://emblem-uk.example/staff/deletion-requests');
  });

  it('escapes summary values before embedding them in the HTML body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendStaffNotificationEmail({ toEmails: ['a@example.test'], eventType: 'deletion_request_filed', summary: { note: '<script>alert(1)</script>' }, linkPath: '/staff/deletion-requests' });
    expect(capturedBody.html).not.toContain('<script>alert(1)</script>');
    expect(capturedBody.html).toContain('&lt;script&gt;');
  });

  it('returns ok:false, never throws, when the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const result = await sendStaffNotificationEmail({ toEmails: ['a@example.test'], eventType: 'deletion_request_filed', summary: {}, linkPath: '/staff/deletion-requests' });
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false, never throws, when fetch itself throws (network failure)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await sendStaffNotificationEmail({ toEmails: ['a@example.test'], eventType: 'deletion_request_filed', summary: {}, linkPath: '/staff/deletion-requests' });
    expect(result).toEqual({ ok: false });
  });

  it('falls back to the raw event_type string as the label for an unrecognised event type, rather than throwing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendStaffNotificationEmail({ toEmails: ['a@example.test'], eventType: 'some_future_event', summary: {}, linkPath: '/staff' });
    expect(capturedBody.subject).toContain('some_future_event');
  });
});
