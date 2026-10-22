import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendInviteEmail } from './send-invite-email';

const CODE = 'GUARD-FIXTURE-CODE';
const EMAIL = 'parent@example.test';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Nothing logged may carry the code, the address or a provider body.
const logged = () => JSON.stringify(warn.mock.calls);

describe('sendInviteEmail — ok only when the provider accepted the email', () => {
  it('confirmed delivery', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fictional-key');
    const fetchMock = vi.fn(async () => new Response('{"id":"email-1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendInviteEmail(EMAIL, CODE)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skipped because email is not configured: no request is made', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendInviteEmail(EMAIL, CODE)).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).not.toContain(CODE);
  });

  it('provider failure: logs only the status, never the response body, address or code', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fictional-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`{"message":"invalid to: ${EMAIL} code ${CODE}"}`, { status: 422 })));
    expect(await sendInviteEmail(EMAIL, CODE)).toEqual({ ok: false, reason: 'provider_rejected' });
    expect(warn).toHaveBeenCalledWith('Resend invite email failed', { status: 422 });
    expect(logged()).not.toContain(CODE);
    expect(logged()).not.toContain(EMAIL);
  });

  it('network failure: never throws, logs only the error type', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fictional-key');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError(`fetch failed for ${EMAIL}`); }));
    expect(await sendInviteEmail(EMAIL, CODE)).toEqual({ ok: false, reason: 'network_error' });
    expect(warn).toHaveBeenCalledWith('Resend invite email threw', { name: 'TypeError' });
    expect(logged()).not.toContain(EMAIL);
  });
});
