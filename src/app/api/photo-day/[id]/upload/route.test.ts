import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { GET, POST } from './route';

const mockMvp = vi.fn();
vi.mock('@/lib/squad-invite-mvp', () => ({ isSquadInviteMvpEnabled: () => mockMvp() }));
const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: (...a: unknown[]) => mockRateLimit(...a) }));
const mockUpload = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/lib/photo-day-storage', () => ({
  uploadPhotoDayObject: (...a: unknown[]) => mockUpload(...a),
  deletePhotoDayObject: (...a: unknown[]) => mockDelete(...a),
}));

const DAY_ID = '0b6c4d2e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const TOKEN = 'A'.repeat(43);
const HASH = createHash('sha256').update(TOKEN).digest('hex');

let dayRow: Record<string, unknown> | null;
let uploadedCount: number;
const mockRpc = vi.fn();
const fromCalls: string[] = [];

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'order', 'range']) c[m] = () => c;
  c.maybeSingle = async () => result;
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'squad_invite_photo_days') return chain({ data: dayRow });
      if (table === 'squad_invite_photo_day_photos') return chain({ count: uploadedCount });
      if (table === 'squad_invites') return chain({ data: { club_team_name: 'Saddleworth 3Ds', football_age_group: 'U10' } });
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

function openDay(overrides: Record<string, unknown> = {}) {
  return {
    id: DAY_ID, campaign_id: 'campaign-1', status: 'shooting', scheduled_for: '2026-11-22', venue_label: 'Astley Sports Village',
    max_photos: 400, photographer_token_hash: HASH, photographer_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    coach_permissions_confirmed_at: new Date().toISOString(), photos_deleted_at: null, ...overrides,
  };
}

const url = `http://localhost/api/photo-day/${DAY_ID}/upload`;
const get = (headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, id = DAY_ID) =>
  GET(new NextRequest(url, { headers }), { params: { id } });
function post(body: Blob | null, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}`, origin: 'http://localhost' }) {
  const form = new FormData();
  if (body) form.append('file', body, 'photo.jpg');
  return POST(new NextRequest(url, { method: 'POST', body: form, headers }), { params: { id: DAY_ID } });
}

let wideJpegWithExif: Blob;

beforeEach(async () => {
  mockMvp.mockReset().mockReturnValue(true);
  mockRateLimit.mockReset().mockResolvedValue(true);
  mockUpload.mockReset().mockResolvedValue('key');
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset().mockResolvedValue({ data: 'photo-1', error: null });
  dayRow = openDay();
  uploadedCount = 3;
  fromCalls.length = 0;
  const bytes = await sharp({ create: { width: 4000, height: 1000, channels: 3, background: '#2a7' } })
    .jpeg().withExif({ IFD0: { Copyright: 'camera-serial-123' } }).toBuffer();
  wideJpegWithExif = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
});

describe('GET /api/photo-day/[id]/upload — link check', () => {
  it('is hidden when the Squad Invite flag is off', async () => {
    mockMvp.mockReturnValue(false);
    expect((await get()).status).toBe(404);
  });

  it('rejects a missing or malformed bearer token without touching the database', async () => {
    expect((await get({})).status).toBe(404);
    expect((await get({ authorization: `Bearer short` })).status).toBe(404);
    expect((await get({ authorization: TOKEN })).status).toBe(404);
    expect(fromCalls).toEqual([]);
  });

  it('gives the same answer for a wrong token as for an unknown day', async () => {
    dayRow = openDay({ photographer_token_hash: 'f'.repeat(64) });
    const wrong = await get();
    dayRow = null;
    const missing = await get();
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it('says the link expired, or uploads are closed', async () => {
    dayRow = openDay({ photographer_token_expires_at: new Date(Date.now() - 1000).toISOString() });
    const expired = await get();
    expect(expired.status).toBe(410);
    expect((await expired.json()).error).toMatch(/expired/);
    dayRow = openDay({ coach_permissions_confirmed_at: null });
    expect((await get()).status).toBe(410);
    dayRow = openDay({ status: 'matching' });
    expect((await get()).status).toBe(410);
  });

  it('is rate limited per IP and per photo day', async () => {
    mockRateLimit.mockResolvedValue(false);
    expect((await get()).status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'photo-day-status', DAY_ID);
  });

  it('returns only team, venue, date and counts, never stored token data', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({
      teamName: 'Saddleworth 3Ds U10', venueLabel: 'Astley Sports Village', scheduledFor: '2026-11-22',
      uploaded: 3, maxPhotos: 400, expiresAt: (dayRow as { photographer_token_expires_at: string }).photographer_token_expires_at,
    });
    expect(JSON.stringify(body)).not.toContain(HASH);
  });
});

describe('POST /api/photo-day/[id]/upload — one photo', () => {
  it('refuses a cross-origin request', async () => {
    const res = await post(wideJpegWithExif, { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses a wrong token before anything reaches storage', async () => {
    dayRow = openDay({ photographer_token_hash: 'f'.repeat(64) });
    expect((await post(wideJpegWithExif)).status).toBe(404);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses when the day already holds max_photos', async () => {
    uploadedCount = 400;
    expect((await post(wideJpegWithExif)).status).toBe(409);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses a file that is not really an image', async () => {
    const res = await post(new Blob(['not an image, just text pretending'], { type: 'image/jpeg' }));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('stores a re-encoded JPEG: resized, metadata stripped, under photo-day/{day}/, then records it', async () => {
    const res = await post(wideJpegWithExif);
    expect(res.status).toBe(201);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [key, bytes, contentType] = mockUpload.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(new RegExp(`^photo-day/${DAY_ID}/[0-9a-f-]{36}\\.jpg$`));
    expect(contentType).toBe('image/jpeg');
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(3200);
    expect(meta.exif).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('record_photo_day_photo', {
      p_photo_day_id: DAY_ID, p_token_hash: HASH, p_storage_key: key, p_bytes: bytes.length,
    });
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'photo-day-upload', DAY_ID);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the stored object when the database refuses it (revoked, closed or full meanwhile)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await post(wideJpegWithExif);
    expect(res.status).toBe(409);
    expect(mockDelete).toHaveBeenCalledWith(mockUpload.mock.calls[0][0]);
  });

  it('deletes the stored object when recording fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await post(wideJpegWithExif);
    expect(res.status).toBe(500);
    expect(mockDelete).toHaveBeenCalledWith(mockUpload.mock.calls[0][0]);
  });

  it('reports a storage failure without recording anything', async () => {
    mockUpload.mockRejectedValue(new Error('AWS_S3_BUCKET is not set'));
    expect((await post(wideJpegWithExif)).status).toBe(503);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
