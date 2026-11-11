import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// F1: with only failures counting against the rate limit, a wrong sign-in
// code must be logged as a failure. Before, this route logged "success" as
// soon as the invite itself was valid, before the code was checked.

const logged: Array<{ code: string; success: boolean }> = [];
let limited = false;
let invite: { used_at: string | null; expires_at: string; invited_email: string | null } | null = null;
let otpError: { message: string } | null = null;

vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMIT_MESSAGE: 'Too many attempts. Please wait 15 minutes, then try again.',
  getRequestIdentifier: () => '203.0.113.7',
  isWithinRateLimit: async () => !limited,
  logClaimAttempt: async (_id: string, code: string, success: boolean) => void logged.push({ code, success }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: invite }) }) }),
    }),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { verifyOtp: async () => ({ error: otpError }) } }),
}));

import { POST } from './route';

const future = new Date(Date.now() + 86_400_000).toISOString();
const req = (body: unknown) =>
  new NextRequest('https://emblem.cards/api/os/invites/verify-code', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  logged.length = 0;
  limited = false;
  otpError = null;
  invite = { used_at: null, expires_at: future, invited_email: 'parent@example.test' };
});

describe('POST /api/os/invites/verify-code', () => {
  it('logs a wrong sign-in code as a failure', async () => {
    otpError = { message: 'Token has expired or is invalid' };
    const res = await POST(req({ inviteCode: 'abc123', token: '00000000' }));
    expect(res.status).toBe(400);
    expect(logged).toEqual([{ code: 'ABC123', success: false }]);
  });

  it('logs a correct sign-in code as a success', async () => {
    const res = await POST(req({ inviteCode: 'ABC123', token: '12345678' }));
    expect(res.status).toBe(200);
    expect(logged).toEqual([{ code: 'ABC123', success: true }]);
  });

  it('logs an invalid or used invite as a failure without checking the code', async () => {
    invite = { used_at: new Date().toISOString(), expires_at: future, invited_email: 'parent@example.test' };
    const res = await POST(req({ inviteCode: 'ABC123', token: '12345678' }));
    expect(res.status).toBe(400);
    expect(logged).toEqual([{ code: 'ABC123', success: false }]);
  });

  it('returns the wait message when limited, and logs nothing', async () => {
    limited = true;
    const res = await POST(req({ inviteCode: 'ABC123', token: '12345678' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many attempts. Please wait 15 minutes, then try again.' });
    expect(logged).toEqual([]);
  });
});
