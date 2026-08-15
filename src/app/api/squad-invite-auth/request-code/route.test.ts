import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as the other route.test.ts files in
 * this repo: a Next.js route handler has a fixed signature, so its
 * Supabase client and rate limiter are mocked at the module boundary.
 */
const mockSignInWithOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { signInWithOtp: mockSignInWithOtp } }),
}));
const mockRateLimit = vi.fn();
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const LINK_TOKEN = randomBytes(32).toString('base64url');

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/squad-invite-auth/request-code', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}; emblem_squad_invite_link=${LINK_TOKEN}`,
      },
    })
  );
}

const EMAIL = 'guardian@example.test';

beforeEach(() => {
  mockSignInWithOtp.mockReset();
  mockRateLimit.mockReset();
  mockRateLimit.mockResolvedValue(true);
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/squad-invite-auth/request-code — OTP reliability', () => {
  it('returns the generic success response when Supabase accepts the request', async () => {
    const res = await post({ email: EMAIL });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/if the address can receive a code/i);
  });

  it('returns a generic non-200 failure when Supabase rejects or fails the request, and never leaks Supabase message/hint/detail', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'email rate limit exceeded for project xyz', status: 429, code: 'over_email_send_rate_limit' },
    });
    const res = await post({ email: EMAIL });
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('rate limit exceeded for project');
    expect(raw).not.toContain('over_email_send_rate_limit');
    expect(raw).not.toContain(EMAIL);
  });

  it('logs only a stable route label and a safe status/code on Supabase failure — never message, email, or identifiers', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: `SMTP delivery failed for ${EMAIL}`, status: 500, code: 'unexpected_failure' },
    });
    await post({ email: EMAIL });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toContain('request-code:signInWithOtp');
    expect(logged).toContain('500');
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain('SMTP delivery failed');
    errorSpy.mockRestore();
  });

  it('malformed input still returns the existing generic 200 behaviour, unchanged', async () => {
    const res = await post({ email: 'x' });
    expect(res.status).toBe(200);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('this app’s own rate limit still returns 429 with the generic body, unchanged', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ email: EMAIL });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('a Supabase failure and the app rate limit are distinguishable by status code', async () => {
    mockRateLimit.mockResolvedValue(false);
    const rateLimited = await post({ email: EMAIL });
    mockRateLimit.mockResolvedValue(true);
    mockSignInWithOtp.mockResolvedValue({ data: null, error: { message: 'x', status: 500 } });
    const supabaseFailure = await post({ email: EMAIL });
    expect(rateLimited.status).toBe(429);
    expect(supabaseFailure.status).toBe(503);
    expect(rateLimited.status).not.toBe(supabaseFailure.status);
  });
});
