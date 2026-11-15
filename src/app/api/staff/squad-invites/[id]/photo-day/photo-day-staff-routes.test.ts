import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createDay } from './route';
import { POST as coachPermission } from './coach-permission/route';
import { POST as photographerLink } from './photographer-link/route';
import { POST as matchPhoto } from './photos/[photoId]/match/route';
import { POST as publishDay } from './publish/route';

const mockMvp = vi.fn();
vi.mock('@/lib/squad-invite-mvp', () => ({ isSquadInviteMvpEnabled: () => mockMvp() }));
const mockPermission = vi.fn();
vi.mock('@/lib/require-squad-invite-permission', () => ({
  requireSquadInvitePermission: (_client: unknown, permission: unknown) => mockPermission(permission),
}));

const CAMPAIGN = '11111111-1111-4111-8111-111111111111';
const DAY = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';
const CHILD = '44444444-4444-4444-8444-444444444444';

let dayRow: { id: string } | null;
let photoRow: { id: string } | null;
const mockRpc = vi.fn();
const photoFilters: unknown[][] = [];
function chain(result: unknown, record?: unknown[][]) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'not']) c[m] = (...args: unknown[]) => { record?.push([m, ...args]); return c; };
  c.maybeSingle = async () => result;
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'squad_invite_photo_days') return chain({ data: dayRow });
      if (table === 'squad_invite_photo_day_photos') return chain({ data: photoRow }, photoFilters);
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

const req = (path: string, body: unknown, origin = 'http://localhost') =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json' } });
const base = `/api/staff/squad-invites/${CAMPAIGN}/photo-day`;

beforeEach(() => {
  mockMvp.mockReset().mockReturnValue(true);
  mockPermission.mockReset().mockResolvedValue({ ok: true, userId: 'staff-1' });
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  dayRow = { id: DAY };
  photoRow = { id: PHOTO };
  photoFilters.length = 0;
});

describe('Photo Day staff routes — shared gates', () => {
  const calls = [
    () => createDay(req(base, { scheduledFor: '2026-11-22', venueLabel: 'Astley', photographerName: 'Blake' }), { params: { id: CAMPAIGN } }),
    () => coachPermission(req(`${base}/coach-permission`, { note: 'Both managers by email' }), { params: { id: CAMPAIGN } }),
    () => photographerLink(req(`${base}/photographer-link`, { action: 'issue', validHours: 48 }), { params: { id: CAMPAIGN } }),
    () => matchPhoto(req(`${base}/photos/${PHOTO}/match`, { action: 'match', participationId: CHILD }), { params: { id: CAMPAIGN, photoId: PHOTO } }),
  ];

  it('all return 404 when the Squad Invite flag is off', async () => {
    mockMvp.mockReturnValue(false);
    for (const call of calls) expect((await call()).status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('all refuse a cross-origin request before checking the session', async () => {
    const cross = [
      () => createDay(req(base, {}, 'https://evil.example'), { params: { id: CAMPAIGN } }),
      () => coachPermission(req(`${base}/coach-permission`, {}, 'https://evil.example'), { params: { id: CAMPAIGN } }),
      () => photographerLink(req(`${base}/photographer-link`, {}, 'https://evil.example'), { params: { id: CAMPAIGN } }),
      () => matchPhoto(req(`${base}/photos/${PHOTO}/match`, {}, 'https://evil.example'), { params: { id: CAMPAIGN, photoId: PHOTO } }),
    ];
    for (const call of cross) expect((await call()).status).toBe(403);
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it('create, coach permission and link need Approver; matching needs Reviewer', async () => {
    for (const call of calls) await call();
    expect(mockPermission.mock.calls.map((c) => c[0])).toEqual([
      'squad_invite_approver', 'squad_invite_approver', 'squad_invite_approver', 'squad_invite_reviewer',
    ]);
  });

  it('all pass a permission refusal straight through', async () => {
    mockPermission.mockResolvedValue({ ok: false, status: 403, error: 'Squad Invite permission required' });
    for (const call of calls) expect((await call()).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('create', () => {
  it('passes the staff id and parsed details to create_squad_invite_photo_day', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, photoDayId: DAY }, error: null });
    const res = await createDay(req(base, { scheduledFor: '2026-11-22', venueLabel: ' Astley ', photographerName: 'Blake', maxPhotos: '250' }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, photoDayId: DAY });
    expect(mockRpc).toHaveBeenCalledWith('create_squad_invite_photo_day', {
      p_campaign_id: CAMPAIGN, p_staff_profile_id: 'staff-1', p_scheduled_for: '2026-11-22',
      p_venue_label: 'Astley', p_photographer_name: 'Blake', p_max_photos: 250,
    });
  });

  it('refuses bad input without calling the database', async () => {
    expect((await createDay(req(base, { scheduledFor: 'soon' }), { params: { id: CAMPAIGN } })).status).toBe(400);
    expect((await createDay(req(base, {}), { params: { id: 'not-a-uuid' } })).status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('turns a database refusal into staff copy', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'date_outside_campaign' }, error: null });
    const res = await createDay(req(base, { scheduledFor: '2026-11-22', venueLabel: 'Astley', photographerName: 'Blake' }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/on or before the campaign deadline/);
  });
});

describe('coach permission', () => {
  it('needs a note of at least 5 characters', async () => {
    expect((await coachPermission(req(`${base}/coach-permission`, { note: 'ok' }), { params: { id: CAMPAIGN } })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('records the note against the campaign’s photo day', async () => {
    const res = await coachPermission(req(`${base}/coach-permission`, { note: '  Both managers by email  ' }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('confirm_photo_day_coach_permissions', { p_photo_day_id: DAY, p_staff_profile_id: 'staff-1', p_note: 'Both managers by email' });
  });

  it('404s when the campaign has no photo day', async () => {
    dayRow = null;
    expect((await coachPermission(req(`${base}/coach-permission`, { note: 'Both managers by email' }), { params: { id: CAMPAIGN } })).status).toBe(404);
  });
});

describe('photographer link', () => {
  it('issues: stores only the hash, returns the link once with the token in the fragment', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, expiresAt: '2026-11-24T10:00:00Z' }, error: null });
    const res = await photographerLink(req(`${base}/photographer-link`, { action: 'issue', validHours: 48 }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    const url = new URL(body.uploadUrl);
    expect(url.pathname).toBe(`/photo-day/upload/${DAY}`);
    const token = url.hash.slice(1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('issue_photo_day_photographer_link');
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(token);
    expect(args.p_valid_hours).toBe(48);
  });

  it('refuses durations that are not offered', async () => {
    expect((await photographerLink(req(`${base}/photographer-link`, { action: 'issue', validHours: 500 }), { params: { id: CAMPAIGN } })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the coach-permission refusal from the database', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'coach_permissions_unconfirmed' }, error: null });
    const res = await photographerLink(req(`${base}/photographer-link`, { action: 'issue', validHours: 48 }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/coaches/);
  });

  it('revokes', async () => {
    const res = await photographerLink(req(`${base}/photographer-link`, { action: 'revoke' }), { params: { id: CAMPAIGN } });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('revoke_photo_day_photographer_link', { p_photo_day_id: DAY, p_staff_profile_id: 'staff-1' });
  });
});

describe('match', () => {
  const call = (body: unknown) => matchPhoto(req(`${base}/photos/${PHOTO}/match`, body), { params: { id: CAMPAIGN, photoId: PHOTO } });

  it('matches through match_photo_day_photo with the staff id', async () => {
    expect((await call({ action: 'match', participationId: CHILD })).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('match_photo_day_photo', { p_photo_id: PHOTO, p_participation_id: CHILD, p_staff_profile_id: 'staff-1' });
  });

  it('only acts on a photo from this campaign’s photo day', async () => {
    await call({ action: 'match', participationId: CHILD });
    expect(photoFilters).toContainEqual(['eq', 'photo_day_id', DAY]);
    photoRow = null;
    expect((await call({ action: 'match', participationId: CHILD })).status).toBe(404);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('needs a child for match, not for unmatch', async () => {
    expect((await call({ action: 'match' })).status).toBe(400);
    expect((await call({ action: 'unmatch' })).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('unmatch_photo_day_photo', { p_photo_id: PHOTO, p_staff_profile_id: 'staff-1' });
  });

  it('shows the consent refusal from the database', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'no_photo_day_consent' }, error: null });
    const res = await call({ action: 'match', participationId: CHILD });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Photo Day permission/);
  });
});

describe('publish', () => {
  const call = (origin = 'http://localhost') => publishDay(req(`${base}/publish`, {}, origin), { params: { id: CAMPAIGN } });

  it('needs Approver and the same origin', async () => {
    await call();
    expect(mockPermission).toHaveBeenLastCalledWith('squad_invite_approver');
    mockPermission.mockClear();
    expect((await call('https://evil.example')).status).toBe(403);
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it('publishes the campaign’s photo day with the staff id', async () => {
    expect((await call()).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('publish_photo_day', { p_photo_day_id: DAY, p_staff_profile_id: 'staff-1' });
  });

  it('explains a refusal', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'photo_day_not_matching' }, error: null });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not open for matching/);
  });
});
