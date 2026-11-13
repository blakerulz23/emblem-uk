import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBuilderGuardianDecisionEmail } from './send-builder-guardian-decision-email';

const ORIGINAL_ENV = { ...process.env };
const PAY_URL = 'https://emblem.example/builder?pay=1';

function capture() {
  process.env.RESEND_API_KEY = 'test-key';
  const captured: { body?: { to?: string; subject?: string; html?: string; text?: string } } = {};
  vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    captured.body = JSON.parse(String((init as RequestInit).body));
    return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
  });
  return captured;
}

describe('sendBuilderGuardianDecisionEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(await sendBuilderGuardianDecisionEmail({ toEmail: 'buyer@example.test', decision: 'approved', payUrl: PAY_URL })).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('approved: tells the buyer, links to the pay-for-an-order page, and says the guardian controls the profile', async () => {
    const captured = capture();
    expect(await sendBuilderGuardianDecisionEmail({ toEmail: 'buyer@example.test', decision: 'approved', payUrl: PAY_URL })).toEqual({ ok: true });
    expect(captured.body?.to).toBe('buyer@example.test');
    expect(captured.body?.subject).toMatch(/approved/i);
    expect(captured.body?.html).toContain(PAY_URL);
    expect(captured.body?.text).toContain(PAY_URL);
    expect(captured.body?.html).toMatch(/Pay for your order/);
    expect(captured.body?.html).toMatch(/which they control/);
    expect(captured.body?.html).toMatch(/Nothing has been charged yet/);
  });

  it('declined: kind, gives no reason, says nothing was charged, and has no pay link', async () => {
    const captured = capture();
    await sendBuilderGuardianDecisionEmail({ toEmail: 'buyer@example.test', decision: 'declined', payUrl: PAY_URL });
    expect(captured.body?.html).toMatch(/won't produce it/);
    expect(captured.body?.html).toMatch(/haven't been charged anything/);
    expect(captured.body?.html).not.toContain(PAY_URL);
    expect(captured.body?.html).not.toMatch(/because|reason/i);
  });

  it('carries no order reference, child data or guardian address', async () => {
    const captured = capture();
    await sendBuilderGuardianDecisionEmail({ toEmail: 'buyer@example.test', decision: 'approved', payUrl: PAY_URL });
    const all = `${captured.body?.subject} ${captured.body?.html} ${captured.body?.text}`;
    expect(all).not.toMatch(/EMB-|order ref|@example\.test/i);
  });

  it('returns ok:false, never throws, when Resend fails or fetch throws', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('err', { status: 500 }));
    expect(await sendBuilderGuardianDecisionEmail({ toEmail: 'b@example.test', decision: 'declined', payUrl: PAY_URL })).toEqual({ ok: false });
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));
    expect(await sendBuilderGuardianDecisionEmail({ toEmail: 'b@example.test', decision: 'approved', payUrl: PAY_URL })).toEqual({ ok: false });
  });
});
