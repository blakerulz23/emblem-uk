import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockHasValidBuilderCsrf = vi.fn();
vi.mock('@/lib/builder-request-security', () => ({ hasValidBuilderCsrf: (...args: unknown[]) => mockHasValidBuilderCsrf(...args) }));

const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockRateLimit(...args) }));

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

const VALID_SUBMISSION_KEY = '11111111-2222-3333-4444-555555555555';

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/builder-authority/declare', { method: 'POST', body: JSON.stringify(body) }));
}

const VALID_BODY = {
  submissionKey: VALID_SUBMISSION_KEY,
  relationship: 'parent_guardian',
  confirmedAgeAndAuthority: true,
  confirmedPhotoPermission: true,
  confirmedCardCreation: true,
};

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: { relationship: 'parent_guardian' }, error: null });
});

describe('POST /api/builder-authority/declare — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a missing submission key', async () => {
    const res = await post({ ...VALID_BODY, submissionKey: undefined });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-UUID-shaped) submission key', async () => {
    const res = await post({ ...VALID_BODY, submissionKey: 'not-a-real-key' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid relationship value', async () => {
    const res = await post({ ...VALID_BODY, relationship: 'best_friend' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/builder-authority/declare — unverified email', () => {
  it('rejects when no authenticated session exists (email never verified via verify-code)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/verify your email/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/builder-authority/declare — rate limiting', () => {
  it('rejects with a visible error (not a silent failure) when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/builder-authority/declare — RPC / DB failure', () => {
  it('a genuine RPC failure (e.g. not all three confirmations true) returns a visible error, never a silent 200', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'all three confirmations are required' } });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });
});

describe('POST /api/builder-authority/declare — unchecked confirmations', () => {
  it('an unchecked confirmation is passed through as false, never silently coerced to true, and the RPC-side rejection surfaces visibly', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'all three confirmations are required' } });
    const res = await post({ ...VALID_BODY, confirmedCardCreation: false });
    expect(mockRpc).toHaveBeenCalledWith('record_builder_authority_declaration', expect.objectContaining({ p_confirmed_card_creation: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('a missing confirmation field entirely is treated the same as false', async () => {
    const bodyWithout = { ...VALID_BODY } as Record<string, unknown>;
    delete bodyWithout.confirmedPhotoPermission;
    await post(bodyWithout);
    expect(mockRpc).toHaveBeenCalledWith('record_builder_authority_declaration', expect.objectContaining({ p_confirmed_photo_permission: false }));
  });
});

describe('POST /api/builder-authority/declare — success', () => {
  it('records the declaration and returns ok:true for a parent/guardian', async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('record_builder_authority_declaration', expect.objectContaining({
      p_submission_key: VALID_SUBMISSION_KEY,
      p_relationship: 'parent_guardian',
      p_confirmed_age_and_authority: true,
      p_confirmed_photo_permission: true,
      p_confirmed_card_creation: true,
    }));
  });

  it('records the declaration for a non-guardian relationship identically — the server never distinguishes production/sharing eligibility here, only authority_status downstream does', async () => {
    mockRpc.mockResolvedValue({ data: { relationship: 'coach' }, error: null });
    const res = await post({ ...VALID_BODY, relationship: 'coach' });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_builder_authority_declaration', expect.objectContaining({ p_relationship: 'coach' }));
  });

  it('coerces a non-true confirmation value to false rather than trusting client truthiness', async () => {
    await post({ ...VALID_BODY, confirmedAgeAndAuthority: 'yes' });
    expect(mockRpc).toHaveBeenCalledWith('record_builder_authority_declaration', expect.objectContaining({ p_confirmed_age_and_authority: false }));
  });
});
