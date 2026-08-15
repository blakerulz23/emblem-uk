import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as order-enquiry/route.test.ts: this is
 * a Next.js route handler with a fixed signature, so its Supabase client
 * and rate limiter are mocked at the module boundary rather than injected.
 * Vitest hoists vi.mock() factories above imports and requires outer
 * variables they close over to be `mock`-prefixed.
 */
const mockVerifyOtp = vi.fn();
const mockUpsert = vi.fn();
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { verifyOtp: mockVerifyOtp }, from: mockFrom }),
}));
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: vi.fn().mockResolvedValue(true),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const USER_ID = '11111111-2222-4333-8444-555555555555';

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/squad-invite-organiser-auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}`,
      },
    })
  );
}

const validBody = { email: 'organiser@example.test', code: '12345678' };

beforeEach(() => {
  vi.stubEnv('SQUAD_INVITE_MVP_ENABLED', 'true');
  vi.stubEnv('VERCEL_ENV', '');
  mockVerifyOtp.mockReset();
  mockUpsert.mockReset();
  mockFrom.mockClear();
  mockVerifyOtp.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockUpsert.mockResolvedValue({ error: null });
});

describe('POST /api/squad-invite-organiser-auth/verify-code — profile provisioning', () => {
  it('creates a minimal { id } profile for a first-time organiser after successful verification', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpsert).toHaveBeenCalledWith({ id: USER_ID }, { onConflict: 'id', ignoreDuplicates: true });
  });

  it('performs the identical idempotent operation for a returning organiser (ignoreDuplicates, not a distinct code path)', async () => {
    // The route never checks "is this a new profile" — ignoreDuplicates
    // makes the same call safe either way. A returning user is simulated
    // by the upsert simply resolving with no error, same as first-time.
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith({ id: USER_ID }, { onConflict: 'id', ignoreDuplicates: true });
  });

  it('never includes role, display_name, or email in the upsert payload, and never overwrites via onConflict', async () => {
    await post(validBody);
    const [payload, options] = mockUpsert.mock.calls[0];
    expect(Object.keys(payload)).toEqual(['id']);
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('display_name');
    expect(payload).not.toHaveProperty('email');
    expect(options.ignoreDuplicates).toBe(true);
  });

  it('does not attempt profile provisioning when verifyOtp fails', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });
    const res = await post(validBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Verification unavailable');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('does not return success when profile provisioning fails, and never leaks Postgres detail to the browser', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '23503', message: 'insert or update on table "profiles" violates foreign key constraint', details: 'Key (id)=(11111111-2222-4333-8444-555555555555) is not present in table "users".' } });
    const res = await post(validBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Verification unavailable' });
    expect(JSON.stringify(body)).not.toContain(USER_ID);
    expect(JSON.stringify(body)).not.toContain('foreign key');
  });

  it('logs only the operation name and error code on provisioning failure — never email, id, token, or Postgres message/detail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsert.mockResolvedValue({ error: { code: '23503', message: 'insert or update on table "profiles" violates foreign key constraint "squad_invite_requests_organiser_profile_id_fkey"', details: `Key (id)=(${USER_ID}) is not present in table "users".` } });
    await post(validBody);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0];
    const loggedText = loggedArgs.join(' ');
    expect(loggedText).toContain('profile-upsert');
    expect(loggedText).toContain('23503');
    expect(loggedText).not.toContain(USER_ID);
    expect(loggedText).not.toContain(validBody.email);
    expect(loggedText).not.toContain(validBody.code);
    expect(loggedText).not.toContain('violates foreign key');
    errorSpy.mockRestore();
  });

  it('keeps the fixed same-origin return target unrelated to profile provisioning', async () => {
    const res = await post(validBody);
    const body = await res.json();
    expect(body.returnTo).toBe('/squad-invite/start');
  });
});
