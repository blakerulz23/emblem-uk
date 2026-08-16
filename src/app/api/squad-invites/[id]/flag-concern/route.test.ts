import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockGetUser = vi.fn();
const mockRateLimit = vi.fn();
const mockCampaignMaybeSingle = vi.fn();
const mockRequestMaybeSingle = vi.fn();
const mockInsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'squad_invites') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockCampaignMaybeSingle }) }) }) };
      if (table === 'squad_invite_requests') return { select: () => ({ eq: () => ({ maybeSingle: mockRequestMaybeSingle }) }) };
      return { insert: mockInsert }; // squad_invite_request_audit_events
    },
  }),
}));
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const USER_ID = '11111111-2222-4333-8444-555555555555';
const CAMPAIGN_ID = '66095c4d-f177-442a-bf35-cc4f76245841';
const REQUEST_ID = 'b8566c7d-8c60-4614-ba4f-f06e8640f61a';

function post(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/flag-concern`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}`,
      },
    }),
    { params: { id: CAMPAIGN_ID } },
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRateLimit.mockReset();
  mockCampaignMaybeSingle.mockReset();
  mockRequestMaybeSingle.mockReset();
  mockInsert.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockRateLimit.mockResolvedValue(true);
  mockCampaignMaybeSingle.mockResolvedValue({ data: { id: CAMPAIGN_ID } });
  mockRequestMaybeSingle.mockResolvedValue({ data: { id: REQUEST_ID } });
  mockInsert.mockResolvedValue({ error: null });
});

describe('POST /api/squad-invites/[id]/flag-concern', () => {
  it('rejects a request with an invalid or missing CSRF token', async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/flag-concern`, { method: 'POST', body: JSON.stringify({ note: 'test' }) }),
      { params: { id: CAMPAIGN_ID } },
    );
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('rejects with 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ note: 'this name is not on our team' });
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ note: 'this name is not on our team' });
    expect(res.status).toBe(429);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a note under 3 characters after trimming', async () => {
    const res = await post({ note: '  a ' });
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects when the campaign does not exist or is not owned by this organiser', async () => {
    mockCampaignMaybeSingle.mockResolvedValue({ data: null });
    const res = await post({ note: 'this name is not on our team' });
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects when no request row matches the campaign', async () => {
    mockRequestMaybeSingle.mockResolvedValue({ data: null });
    const res = await post({ note: 'this name is not on our team' });
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts an audit event with the trimmed, length-capped note and the correct actor role/event type', async () => {
    const res = await post({ note: `  this name is not on our team  ` });
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith({
      request_id: REQUEST_ID, actor_profile_id: USER_ID, actor_role: 'organiser',
      event_type: 'organiser_flagged_concern', metadata: { note: 'this name is not on our team' },
    });
  });

  it('caps the note at 500 characters', async () => {
    const long = 'x'.repeat(600);
    await post({ note: long });
    const call = mockInsert.mock.calls[0][0] as { metadata: { note: string } };
    expect(call.metadata.note.length).toBe(500);
  });

  it('logs only a fixed route label and a safe error code on insert failure — never the note text', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    const res = await post({ note: 'a very specific private concern about a family' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toBe('squad-invites/flag-concern:insert 23505');
    expect(logged).not.toContain('private concern');
    expect(logged).not.toContain('duplicate key');
    errorSpy.mockRestore();
  });

  it('sets no-store cache headers on success', async () => {
    const res = await post({ note: 'this name is not on our team' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
