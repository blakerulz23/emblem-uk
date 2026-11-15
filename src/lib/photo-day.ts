import { randomUUID } from 'crypto';
import { createSquadInviteLinkToken, hashSquadInviteLinkToken } from './squad-invite-link';

/**
 * Photo Day (docs/architecture/photo-day-design-v0.1.md): shared rules for
 * the staff routes, the photographer upload route and the pages.
 *
 * The database functions (migrations 0104/0105) are the authority for every
 * rule that matters (token, expiry, coach permission, cap, consent). This
 * module only parses input and turns their refusal reasons into staff copy.
 */

/**
 * Vercel caps a function's request body at about 4.5 MB, so the upload page
 * resizes each photo in the browser before sending it (a card needs nothing
 * near full camera resolution). 4 MB leaves room for multipart framing.
 */
export const PHOTO_DAY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_DAY_UPLOAD_MAX_REQUEST_BYTES = PHOTO_DAY_UPLOAD_MAX_BYTES + 64 * 1024;
/** Longest edge kept after re-encoding. A printed card needs about 1,100 px. */
export const PHOTO_DAY_MAX_EDGE_PX = 3200;
/** Staff thumbnails: short-lived, same order as the anonymous builder's 15 minutes. */
export const PHOTO_DAY_STAFF_PREVIEW_TTL_SEC = 60 * 15;
export const PHOTO_DAY_LINK_HOURS = [24, 48, 72, 168] as const;
export const PHOTO_DAY_DEFAULT_MAX_PHOTOS = 400;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Issues a photographer token. Only the hash is ever stored. */
export function createPhotographerToken() {
  return createSquadInviteLinkToken();
}

/** Null for anything that is not a well-formed token (never throws). */
export function hashPhotographerToken(token: string): string | null {
  try {
    return hashSquadInviteLinkToken(token);
  } catch {
    return null;
  }
}

/** Reads `Authorization: Bearer <token>`. The token never travels in a URL. */
export function readBearerToken(headers: { get(name: string): string | null }): string | null {
  const value = headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? match[1] : null;
}

/**
 * The link staff send the photographer. The token sits in the #fragment,
 * which browsers never send to the server or in a Referer header.
 */
export function photographerUploadUrl(origin: string, photoDayId: string, token: string) {
  return `${origin}/photo-day/upload/${photoDayId}#${token}`;
}

/** Every stored photo is re-encoded to JPEG, so the key always ends .jpg. */
export function photoDayStorageKey(photoDayId: string) {
  if (!isUuid(photoDayId)) throw new Error('Invalid photo day');
  return `photo-day/${photoDayId}/${randomUUID()}.jpg`;
}

export interface PhotoDayCreateInput {
  scheduledFor: string;
  venueLabel: string;
  photographerName: string;
  maxPhotos: number;
}

export function parsePhotoDayCreateInput(body: unknown): PhotoDayCreateInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const scheduledFor = typeof b.scheduledFor === 'string' && DATE_RE.test(b.scheduledFor) ? b.scheduledFor : null;
  const venueLabel = typeof b.venueLabel === 'string' ? b.venueLabel.trim() : '';
  const photographerName = typeof b.photographerName === 'string' ? b.photographerName.trim() : '';
  const maxPhotos = b.maxPhotos === undefined || b.maxPhotos === null || b.maxPhotos === ''
    ? PHOTO_DAY_DEFAULT_MAX_PHOTOS
    : Number(b.maxPhotos);
  if (!scheduledFor || Number.isNaN(Date.parse(`${scheduledFor}T00:00:00Z`))) return null;
  if (venueLabel.length < 2 || venueLabel.length > 160) return null;
  if (photographerName.length < 2 || photographerName.length > 120) return null;
  if (!Number.isInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > 1000) return null;
  return { scheduledFor, venueLabel, photographerName, maxPhotos };
}

export function parseLinkHours(value: unknown): number | null {
  const n = Number(value);
  return (PHOTO_DAY_LINK_HOURS as readonly number[]).includes(n) ? n : null;
}

const REASON_COPY: Record<string, string> = {
  not_staff: 'Your account is not a staff account.',
  campaign_not_found: 'That campaign was not found.',
  campaign_not_open: 'A photo day can only be added while the campaign is being set up or is active.',
  already_exists: 'This campaign already has a photo day.',
  date_outside_campaign: 'The shoot must be today or later, and on or before the campaign deadline.',
  invalid_details: 'Check the venue, photographer name and photo limit.',
  photo_day_not_found: 'This campaign has no photo day.',
  photo_day_closed: 'This photo day is closed or cancelled.',
  already_confirmed: 'Coach permission is already confirmed.',
  note_required: 'Say how both coaches gave permission (5 to 300 characters).',
  invalid_token: 'The link could not be created. Try again.',
  invalid_validity: 'Choose how long the link should work.',
  photo_day_not_accepting_uploads: 'Uploads are closed: matching has started, or the photos were deleted.',
  coach_permissions_unconfirmed: 'Confirm both coaches’ permission before issuing the photographer link.',
  no_active_link: 'There is no active photographer link.',
  photo_not_found: 'That photo no longer exists.',
  photo_day_not_matching: 'This photo day is not open for matching.',
  participation_not_in_campaign: 'That child is not part of this campaign.',
  participation_not_open: 'That child’s card is already committed, so the photo cannot be changed here.',
  no_photo_day_consent: 'That parent has not given (or has withdrawn) Photo Day permission.',
  not_matched: 'That photo is not matched.',
};

export function photoDayReasonMessage(reason: unknown): string {
  return (typeof reason === 'string' && REASON_COPY[reason]) || 'That did not work. Refresh and try again.';
}

/** Shape every Photo Day RPC that returns jsonb uses. */
export function readRpcOutcome(data: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
    return { ok: true, value: data as Record<string, unknown> };
  }
  const reason = data && typeof data === 'object' ? String((data as { reason?: unknown }).reason ?? 'unknown') : 'unknown';
  return { ok: false, reason };
}

/**
 * How staff see a child while matching. Uses the participation's own
 * display columns (already cleared by the 0076 erasure flow), never a new
 * copy of the child's name. Phase 3's consent step fills them in before
 * the shoot; until then the label says the name is missing.
 */
export function photoDayChildLabel(p: { display_first_name: string | null; display_surname_initial: string | null; squad_number: number | null }, index: number) {
  const name = p.display_first_name ? `${p.display_first_name}${p.display_surname_initial ? ` ${p.display_surname_initial}.` : ''}` : `Child ${index + 1} (name not given yet)`;
  return p.squad_number !== null && p.squad_number !== undefined ? `${name} · #${p.squad_number}` : name;
}
