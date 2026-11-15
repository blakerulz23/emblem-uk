import { randomBytes, createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as consentPost } from './photo-day-consent/route';
import { GET as photoGet } from './photo-day-photos/[photoId]/route';

/**
 * Photo Day phase 3 parent routes. The database and S3 are mocked; the
 * ownership/visibility rules in src/lib/photo-day-parent.ts run for real
 * against the mocked rows.
 */
const mockMvp = vi.fn();
vi.mock('@/lib/squad-invite-mvp', () => ({ isSquadInviteMvpEnabled: () => mockMvp() }));
const mockRateLimit = vi.fn();
vi.mock('@/lib/squad-invite-rate-limit', () => ({ consumeSquadInviteRateLimit: (...a: unknown[]) => mockRateLimit(...a) }));
const mockGetObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({ getObjectBytes: (...a: unknown[]) => mockGetObject(...a) }));
const mockBuilderCookie = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'emblem_squad_builder' ? mockBuilderCookie() : undefined) }),
  headers: () => new Headers(),
}));

const PARTICIPATION = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';
const OTHER_PHOTO = '33333333-3333-4333-8333-333333333333';
const GUARDIAN = 'guardian-1';
const BUILDER_TOKEN = randomBytes(32).toString('base64url');
const BUILDER_HASH = createHash('sha256').update(BUILDER_TOKEN).digest('hex');
const CSRF = randomBytes(32).toString('base64url');

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
let rows: Record<string, unknown>;
let listRows: Record<string, unknown[]>;
const filters: unknown[][] = [];
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order']) c[m] = (...args: unknown[]) => { filters.push([table, m, ...args]); return c; };
      c.maybeSingle = async () => ({ data: rows[table] ?? null });
      c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: listRows[table] ?? [] }).then(resolve);
      return c;
    },
  }),
}));

function consent(body: unknown, opts: { origin?: string; csrf?: string } = {}) {
  return consentPost(new NextRequest(`http://localhost/api/squad-invite-participations/${PARTICIPATION}/photo-day-consent`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: opts.origin ?? 'http://localhost', 'x-emblem-csrf': opts.csrf ?? CSRF, cookie: `emblem_squad_csrf=${CSRF}`, 'content-type': 'application/json' },
  }), { params: { id: PARTICIPATION } });
}
const photo = (photoId = PHOTO) => photoGet(new NextRequest(`http://localhost/api/squad-invite-participations/${PARTICIPATION}/photo-day-photos/${photoId}`), { params: { id: PARTICIPATION, photoId } });

beforeEach(() => {
  mockMvp.mockReset().mockReturnValue(true);
  mockRateLimit.mockReset().mockResolvedValue(true);
  mockGetObject.mockReset().mockResolvedValue({ bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]), contentType: 'image/jpeg' });
  mockBuilderCookie.mockReset().mockReturnValue({ value: BUILDER_TOKEN });
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: GUARDIAN } } });
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true, decision: 'granted' }, error: null });
  filters.length = 0;
  rows = {
    squad_invite_participations: { id: PARTICIPATION, campaign_id: 'campaign-1', status: 'started' },
    squad_invite_photo_days: { id: 'day-1', status: 'published', scheduled_for: '2026-11-22', venue_label: 'Astley', photos_deleted_at: null },
    squad_invite_permissions: { granted: true, withdrawn_at: null },
    squad_invite_photo_day_photos: { storage_key: `photo-day/day-1/${PHOTO}.jpg` },
  };
  listRows = { squad_invite_photo_day_photos: [{ id: PHOTO }] };
});

describe('POST photo-day-consent', () => {
  it('is hidden when the Squad Invite flag is off', async () => {
    mockMvp.mockReturnValue(false);
    expect((await consent({ granted: false })).status).toBe(404);
  });

  it('requires valid CSRF from the same origin', async () => {
    expect((await consent({ granted: false }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await consent({ granted: false }, { csrf: 'x'.repeat(43) })).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires a signed-in parent and the builder credential', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await consent({ granted: false })).status).toBe(401);
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN } } });
    mockBuilderCookie.mockReturnValue(undefined);
    expect((await consent({ granted: false })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('grants with the child details, proving ownership by guardian + hashed builder credential', async () => {
    const res = await consent({ granted: true, firstName: ' Sam ', surnameInitial: 't', squadNumber: '7' });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_photo_day_consent', {
      p_participation_id: PARTICIPATION, p_guardian_profile_id: GUARDIAN, p_builder_token_hash: BUILDER_HASH,
      p_granted: true, p_first_name: 'Sam', p_surname_initial: 'T', p_squad_number: 7,
    });
  });

  it('declines without sending any child details', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, decision: 'declined' }, error: null });
    await consent({ granted: false, firstName: 'Sam' });
    expect(mockRpc).toHaveBeenCalledWith('record_photo_day_consent', expect.objectContaining({
      p_granted: false, p_first_name: null, p_surname_initial: null, p_squad_number: null,
    }));
  });

  it('rejects bad child details before the database', async () => {
    expect((await consent({ granted: true, firstName: 'Sam', surnameInitial: '7' })).status).toBe(400);
    expect((await consent({ granted: true, firstName: 'A'.repeat(25), surnameInitial: 'T' })).status).toBe(400);
    expect((await consent({ granted: 'yes' })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('explains a too-late grant in parent language', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'photo_day_already_taken' }, error: null });
    const res = await consent({ granted: true, firstName: 'Sam', surnameInitial: 'T' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already been taken/);
  });

  it('is rate limited per participation', async () => {
    mockRateLimit.mockResolvedValue(false);
    expect((await consent({ granted: false })).status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'photo-day-consent', PARTICIPATION);
  });
});

describe('GET photo-day-photos/[photoId] — own child only', () => {
  it('serves a matched photo of the parent’s own child from this origin, never cached', async () => {
    const res = await photo();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockGetObject).toHaveBeenCalledWith(`photo-day/day-1/${PHOTO}.jpg`);
  });

  it('checks the participation belongs to this guardian and builder credential', async () => {
    await photo();
    expect(filters).toContainEqual(['squad_invite_participations', 'eq', 'guardian_profile_id', GUARDIAN]);
    expect(filters).toContainEqual(['squad_invite_participations', 'eq', 'builder_token_hash', BUILDER_HASH]);
  });

  it('refuses a photo not matched to this child (same 404, nothing read from storage)', async () => {
    expect((await photo(OTHER_PHOTO)).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('shows nothing until staff publish', async () => {
    rows.squad_invite_photo_days = { id: 'day-1', status: 'matching', scheduled_for: '2026-11-22', venue_label: 'Astley', photos_deleted_at: null };
    expect((await photo()).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('shows nothing once consent is withdrawn or declined', async () => {
    rows.squad_invite_permissions = { granted: true, withdrawn_at: '2026-11-23T10:00:00Z' };
    expect((await photo()).status).toBe(404);
    rows.squad_invite_permissions = { granted: false, withdrawn_at: null };
    expect((await photo()).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('shows nothing for someone else’s participation, or once the card is committed', async () => {
    rows.squad_invite_participations = null;
    expect((await photo()).status).toBe(404);
    rows.squad_invite_participations = { id: PARTICIPATION, campaign_id: 'campaign-1', status: 'commitment_completed' };
    expect((await photo()).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('needs sign-in and the builder credential', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await photo()).status).toBe(401);
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN } } });
    mockBuilderCookie.mockReturnValue(undefined);
    expect((await photo()).status).toBe(404);
  });
});
