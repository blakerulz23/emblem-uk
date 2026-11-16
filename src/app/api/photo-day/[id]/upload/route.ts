import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { deleteObject, uploadObject } from '@/lib/s3-client';
import { sniffImageMimeType } from '@/lib/file-signature';
import {
  PHOTO_DAY_MAX_EDGE_PX, PHOTO_DAY_UPLOAD_MAX_BYTES, PHOTO_DAY_UPLOAD_MAX_REQUEST_BYTES,
  hashPhotographerToken, isUuid, photoDayStorageKey, readBearerToken,
} from '@/lib/photo-day';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
// One answer for "no such day" and "wrong token", so the route never says
// whether a photo day id exists.
const INVALID_LINK = { error: 'This upload link is not valid. Ask Emblem for a new one.' };
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

type DayRow = {
  id: string;
  campaign_id: string;
  status: string;
  scheduled_for: string;
  venue_label: string;
  max_photos: number;
  photographer_token_hash: string | null;
  photographer_token_expires_at: string | null;
  coach_permissions_confirmed_at: string | null;
  photos_deleted_at: string | null;
};

function sameHash(stored: string | null, presented: string) {
  if (!stored || stored.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(presented));
}

/**
 * Authenticates the photographer link and says whether it can take
 * uploads now. A cheap pre-check so nothing reaches S3 for a bad link;
 * record_photo_day_photo (migration 0104) is still the authority and
 * re-checks everything under a row lock after the object is stored.
 */
async function loadDay(photoDayId: string, tokenHash: string) {
  const service = createServiceRoleClient();
  const { data } = await service.from('squad_invite_photo_days')
    .select('id,campaign_id,status,scheduled_for,venue_label,max_photos,photographer_token_hash,photographer_token_expires_at,coach_permissions_confirmed_at,photos_deleted_at')
    .eq('id', photoDayId).maybeSingle<DayRow>();
  if (!data || !sameHash(data.photographer_token_hash, tokenHash)) return { kind: 'invalid' as const };
  if (!data.photographer_token_expires_at || new Date(data.photographer_token_expires_at) <= new Date()) {
    return { kind: 'closed' as const, message: 'This upload link has expired. Ask Emblem for a new one.' };
  }
  if (!['scheduled', 'shooting'].includes(data.status) || data.photos_deleted_at || !data.coach_permissions_confirmed_at) {
    return { kind: 'closed' as const, message: 'Uploads for this photo day are closed.' };
  }
  const { count } = await service.from('squad_invite_photo_day_photos')
    .select('id', { count: 'exact', head: true }).eq('photo_day_id', photoDayId).is('deleted_at', null);
  return { kind: 'open' as const, day: data, uploaded: count ?? 0 };
}

async function authenticate(request: NextRequest, photoDayId: string, action: 'photo-day-status' | 'photo-day-upload') {
  if (!isUuid(photoDayId)) return { ok: false as const, response: NextResponse.json(INVALID_LINK, { status: 404, headers: NO_STORE }) };
  const token = readBearerToken(request.headers);
  const tokenHash = token ? hashPhotographerToken(token) : null;
  if (!tokenHash) return { ok: false as const, response: NextResponse.json(INVALID_LINK, { status: 404, headers: NO_STORE }) };
  if (!(await consumeAnonymousRequestRateLimit(request.headers, action, photoDayId))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Too many uploads at once. Wait a few minutes, then retry the failed photos.' }, { status: 429, headers: NO_STORE }) };
  }
  const state = await loadDay(photoDayId, tokenHash);
  if (state.kind === 'invalid') return { ok: false as const, response: NextResponse.json(INVALID_LINK, { status: 404, headers: NO_STORE }) };
  if (state.kind === 'closed') return { ok: false as const, response: NextResponse.json({ error: state.message }, { status: 410, headers: NO_STORE }) };
  return { ok: true as const, state, tokenHash };
}

/** What the upload page shows: never anything about the children. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await authenticate(request, params.id, 'photo-day-status');
  if (!auth.ok) return auth.response;
  const { day, uploaded } = auth.state;
  const { data: campaign } = await createServiceRoleClient().from('squad_invites')
    .select('club_team_name,football_age_group').eq('id', day.campaign_id).maybeSingle();
  return NextResponse.json({
    teamName: campaign ? `${campaign.club_team_name} ${campaign.football_age_group}`.trim() : 'Your team',
    venueLabel: day.venue_label,
    scheduledFor: day.scheduled_for,
    uploaded,
    maxPhotos: day.max_photos,
    expiresAt: day.photographer_token_expires_at,
  }, { headers: NO_STORE });
}

/**
 * One photo per request (the page sends them one by one). The photo is
 * re-encoded to JPEG with sharp before storage: orientation applied,
 * longest edge capped, and all metadata (EXIF, GPS, camera serial) dropped.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403, headers: NO_STORE });
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > PHOTO_DAY_UPLOAD_MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413, headers: NO_STORE });
  }
  const auth = await authenticate(request, params.id, 'photo-day-upload');
  if (!auth.ok) return auth.response;
  if (auth.state.uploaded >= auth.state.day.max_photos) {
    return NextResponse.json({ error: `This photo day already has its limit of ${auth.state.day.max_photos} photos.` }, { status: 409, headers: NO_STORE });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo received' }, { status: 400, headers: NO_STORE });
  if (file.size < 1 || file.size > PHOTO_DAY_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413, headers: NO_STORE });
  }
  const input = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageMimeType(input);
  if (!sniffed || !ACCEPTED.has(sniffed)) {
    return NextResponse.json({ error: 'Only JPEG, PNG or WebP photos can be uploaded' }, { status: 400, headers: NO_STORE });
  }

  let jpeg: Buffer;
  try {
    jpeg = await sharp(input, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: PHOTO_DAY_MAX_EDGE_PX, height: PHOTO_DAY_MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'That photo could not be read' }, { status: 400, headers: NO_STORE });
  }

  const key = photoDayStorageKey(params.id);
  try {
    await uploadObject(key, jpeg, 'image/jpeg');
  } catch {
    return NextResponse.json({ error: 'Storage is unavailable. Retry this photo.' }, { status: 503, headers: NO_STORE });
  }
  const { data: photoId, error } = await createServiceRoleClient().rpc('record_photo_day_photo', {
    p_photo_day_id: params.id, p_token_hash: auth.tokenHash, p_storage_key: key, p_bytes: jpeg.length,
  });
  if (error || !photoId) {
    // Refused (link revoked/expired meanwhile, uploads closed, or cap hit)
    // or failed: the stored object must not outlive the refusal.
    await deleteObject(key).catch(() => undefined);
    return error
      ? NextResponse.json({ error: 'The photo could not be saved. Retry this photo.' }, { status: 500, headers: NO_STORE })
      : NextResponse.json({ error: 'Uploads for this photo day are closed or full.' }, { status: 409, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}
