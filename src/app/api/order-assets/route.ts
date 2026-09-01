import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSignedDownloadUrl, uploadObject, copyObject, deleteObject } from '@/lib/s3-client';
import { hashBuilderToken } from '@/lib/squad-invite';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import {
  BUILDER_SUBMISSION_COOKIE,
  verifyBuilderSubmissionCapability,
  reserveBuilderSubmissionAssetSlot,
  releaseBuilderSubmissionAssetSlot,
  finishBuilderSubmissionAssetReservation,
} from '@/lib/builder-submission-capability';
import {
  reserveSquadInviteParticipationAssetSlot,
  releaseSquadInviteParticipationAssetSlot,
  finishSquadInviteParticipationAssetReservation,
} from '@/lib/squad-invite-participation-assets';
import { sniffImageMimeType, type SniffedImageType } from '@/lib/file-signature';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

export const runtime = 'nodejs';
export const maxDuration = 60;

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const HEIC_FAMILY = new Set(['image/heic', 'image/heif']);
/**
 * Per-FILE ceiling, in bytes — matches order-enquiry-validation.ts's own
 * ASSET_RULES.photo.maxBytes for consistency (18MB comfortably covers a
 * genuine high-resolution phone photo). Distinct from the AGGREGATE,
 * per-submission/per-participation ceilings in builder-submission-
 * capability.ts and squad-invite-participation-assets.ts, which bound the
 * whole submission's/participation's lifetime total, not one request.
 */
const MAX_ASSET_BYTES = 18 * 1024 * 1024;
// Multipart framing (boundary strings, field headers) adds a small,
// bounded overhead on top of the raw file bytes — 1MB is generous margin
// for that plus the other (tiny) text fields this form carries.
const MAX_REQUEST_BODY_BYTES = MAX_ASSET_BYTES + 1024 * 1024;
// Caller downloads/re-references immediately after upload — no legitimate
// reason for the 7-day SigV4 ceiling other long-lived customer downloads
// use.
const SIGNED_URL_TTL_SEC = 60 * 15;
// Set by Squad Invite's own participation start (src/app/api/squad-invite-
// links/participation/route.ts) — a DIFFERENT, already-secure capability
// system than the one below, reused here rather than duplicated.
const SQUAD_INVITE_BUILDER_COOKIE = 'emblem_squad_builder';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'asset';
}

type VerifiedContext =
  | { kind: 'builder'; namespace: string }
  | { kind: 'squad-invite'; namespace: string; builderTokenHash: string };

/**
 * Determines which of the two legitimate anonymous journeys this upload
 * belongs to and returns a server-VERIFIED namespace — never the client's
 * own claimed `orderId`. Two different capability systems (the normal
 * builder's own httpOnly capability, and Squad Invite's pre-existing
 * builder-token cookie), one coherent contract: both return either a
 * verified context or null, and the route treats them identically for
 * everything except which reserve/release functions it calls.
 */
async function resolveVerifiedContext(claimedOrderId: string): Promise<VerifiedContext | null> {
  // Both capability cookies can legitimately be live in the SAME browser at
  // once — e.g. someone who tried the ordinary builder earlier and is now,
  // separately, completing a Squad Invite participation. The presence of
  // one system's cookie must never by itself preempt trying the other:
  // each is checked against its own matching criteria for THIS specific
  // claimedOrderId, and the request only fails once neither matches. (A
  // stale/expired/mismatched builder cookie used to short-circuit here and
  // return null immediately, silently blocking a perfectly valid,
  // concurrent Squad Invite upload — that was the actual cause of the
  // "photo couldn't be saved" report this comment accompanies the fix for.)
  const builderToken = cookies().get(BUILDER_SUBMISSION_COOKIE)?.value;
  if (builderToken) {
    const submissionId = await verifyBuilderSubmissionCapability(builderToken);
    // The client-claimed id must match the verified one — a mismatch means
    // either a confused caller or an attempt to write into a namespace it
    // holds no capability for. Falls through to the squad-invite check
    // below rather than failing outright, since a mismatch here says
    // nothing about whether a separate, valid squad-invite capability
    // also exists for this same request.
    if (submissionId && claimedOrderId === submissionId) {
      return { kind: 'builder', namespace: submissionId };
    }
  }

  const squadToken = cookies().get(SQUAD_INVITE_BUILDER_COOKIE)?.value;
  if (squadToken && UUID_RE.test(claimedOrderId)) {
    // Ownership (builder_token_hash match) and 'started' status are
    // re-verified atomically inside reserve_squad_invite_participation_
    // asset_slot itself — this route no longer performs a separate,
    // earlier SELECT for it, so there is exactly one authoritative check,
    // not two that could disagree under a race.
    return { kind: 'squad-invite', namespace: claimedOrderId, builderTokenHash: hashBuilderToken(squadToken) };
  }

  return null;
}

export async function POST(request: NextRequest) {
  let reservedContext: { release: () => Promise<boolean> } | null = null;
  try {
    // CSRF fails before form parsing, capability/ownership verification,
    // rate limiting or storage access — a request that can't prove
    // same-origin + a matching double-submit cookie/header pair never
    // gets far enough to consume any of those.
    if (!hasValidBuilderCsrf(request)) {
      return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
    }

    // Rejects an oversized request before ever parsing the multipart body
    // into memory — a declared content-length alone is enough to fail
    // closed here, no bytes need to be held first.
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json({ error: 'request too large' }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const claimedOrderId = String(form.get('orderId') || '');
    const playerId = cleanSegment(String(form.get('playerId') || 'shared'));
    const kind = cleanSegment(String(form.get('kind') || 'photo'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
    }
    if (file.size > MAX_ASSET_BYTES) {
      return NextResponse.json({ error: `Image must be under ${Math.round(MAX_ASSET_BYTES / (1024 * 1024))}MB` }, { status: 413 });
    }

    // Capability/ownership verification happens before any S3 access, and
    // before the rate limiter — an unverified caller never gets to consume
    // rate-limit budget or reach storage at all.
    const context = await resolveVerifiedContext(claimedOrderId);
    if (!context) {
      return NextResponse.json({ error: 'A valid submission is required' }, { status: 401 });
    }

    const allowedRate = await consumeAnonymousRequestRateLimit(request.headers, 'order-asset-upload', context.namespace);
    if (!allowedRate) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // A declared MIME type alone is never trusted — the file's own leading
    // bytes must agree with it (HEIC/HEIF share one container format and
    // are told apart only by convention, so either declared value is
    // accepted against a sniffed HEIC-family result).
    const sniffed: SniffedImageType | null = sniffImageMimeType(bytes);
    const sniffMatches = sniffed !== null && (sniffed === file.type || (HEIC_FAMILY.has(file.type) && sniffed === 'image/heic'));
    if (!sniffMatches) {
      return NextResponse.json({ error: 'File content does not match an allowed image type' }, { status: 400 });
    }

    // A stable logical slot — the SAME player+kind pair always maps to the
    // same slot, which is what makes a genuine replacement update one
    // ledger row (charging only the byte delta) and overwrite one S3
    // object, rather than accumulating a new one every time. No file
    // extension in the key: correct Content-Type is set on the S3 object
    // itself, so changing file type on a replacement still truly overwrites
    // instead of creating an orphaned, differently-keyed object.
    const slotKey = `${playerId}:${kind}`;
    const key = `order-assets/${context.namespace}/${slotKey}`;

    // Reserve BEFORE uploading — see migration 0068/0070's own comments for
    // why this ordering (not upload-then-account) is what keeps accounting
    // correct when a replacement would grow a slot past the ceiling.
    const reservation = context.kind === 'builder'
      ? await reserveBuilderSubmissionAssetSlot(context.namespace, slotKey, file.size)
      : await reserveSquadInviteParticipationAssetSlot(context.namespace, context.builderTokenHash, slotKey, file.size);
    if (!reservation.ok || !reservation.reservationId) {
      return NextResponse.json({ error: 'This submission has reached its upload allowance' }, { status: 413 });
    }
    const reservationId = reservation.reservationId;
    reservedContext = {
      release: () => context.kind === 'builder'
        ? releaseBuilderSubmissionAssetSlot(context.namespace, slotKey, reservationId, reservation.previousBytes)
        : releaseSquadInviteParticipationAssetSlot(context.namespace, slotKey, reservationId, reservation.previousBytes),
    };

    // Uploaded to a reservation-specific TEMPORARY key, never straight to
    // the slot's shared final key — two concurrent replacements of the
    // same slot each get their own temp object, so neither upload can ever
    // blindly clobber the other mid-flight. Only the reservation that is
    // still CURRENT once its own upload finishes gets promoted onto the
    // shared final key below.
    const tempKey = `${key}.pending-${reservationId}`;
    await uploadObject(tempKey, bytes, file.type);

    // Confirms this reservation is still the slot's current one — i.e. no
    // later reservation (a concurrent replacement of the SAME slot) has
    // superseded it since reserve() ran. This is the earliest point that
    // check can happen relative to the S3 write above; it does not by
    // itself make the read-then-copy sequence a single atomic operation
    // spanning Postgres and S3 (no such primitive exists across the two
    // systems — seeCommit note below), but it closes the exact failure
    // this route must never allow: an upload whose reservation has
    // already lost the race being promoted over a newer, already-current
    // upload's object.
    const isCurrent = context.kind === 'builder'
      ? await finishBuilderSubmissionAssetReservation(context.namespace, slotKey, reservationId)
      : await finishSquadInviteParticipationAssetReservation(context.namespace, slotKey, reservationId);

    if (!isCurrent) {
      // Superseded: a newer reservation for this same slot already won.
      // This reservation's ledger row no longer belongs to it, so there is
      // nothing left to "release" for capacity purposes — only the
      // orphaned temporary S3 object needs cleaning up. Best-effort: a
      // cleanup failure here just leaves one harmless, never-referenced
      // temporary object behind, not a correctness problem.
      reservedContext = null;
      await deleteObject(tempKey).catch((err) => {
        console.error('order-assets:cleanup-stale-temp-object', err instanceof Error ? err.message : 'unknown error');
      });
      return NextResponse.json({ error: 'This upload was replaced by a newer one for the same item' }, { status: 409 });
    }

    // Promote: copy the confirmed-current temporary object onto the slot's
    // stable, deterministic final key, then remove the temporary one.
    await copyObject(tempKey, key);

    // Defense-in-depth re-check, not a claim of full atomicity: if another
    // reservation became current in the narrow window between the check
    // above and the copy just now, this call returns false and we log it
    // as a rare, operationally-visible race rather than silently trusting
    // the promote succeeded correctly. The ledger itself is never at risk
    // either way (release/finish are always gated on reservation identity,
    // never on timing) — and the other, genuinely-current reservation's
    // own request independently repeats this same reserve->finish->copy
    // sequence, so the final S3 object still converges to its content.
    const stillCurrentAfterCopy = context.kind === 'builder'
      ? await finishBuilderSubmissionAssetReservation(context.namespace, slotKey, reservationId)
      : await finishSquadInviteParticipationAssetReservation(context.namespace, slotKey, reservationId);
    if (!stillCurrentAfterCopy) {
      console.error('order-assets:promoted-after-supersession', 'a newer reservation won during promotion — relying on its own promote to converge the final object');
    }

    await deleteObject(tempKey).catch((err) => {
      console.error('order-assets:cleanup-promoted-temp-object', err instanceof Error ? err.message : 'unknown error');
    });
    reservedContext = null; // upload + promotion succeeded — nothing left to release on the way out

    const url = await getSignedDownloadUrl(key, SIGNED_URL_TTL_SEC);

    return NextResponse.json({
      ok: true,
      key,
      url,
      contentType: file.type,
      size: file.size,
      fileName: file.name,
    });
  } catch (error) {
    // A failed write must never permanently consume capacity — release the
    // reservation this attempt made, if any, before returning. Best-effort:
    // a release failure is logged inside the release helper itself and
    // never re-thrown, so it can't mask the original error response below.
    if (reservedContext) await reservedContext.release();

    const message = error instanceof Error ? error.message : '';
    const storageNotConfigured = message.includes('AWS_S3_BUCKET');
    // Fixed route label + a safe category only — never the raw error
    // message (which can include S3/SDK detail), never a filename, S3 key,
    // order/player id, email, or request body.
    console.error('order-assets:upload', storageNotConfigured ? 'storage_not_configured' : 'upload_failed');
    return NextResponse.json(
      { error: storageNotConfigured ? 'Production asset storage is not configured' : 'Could not upload order asset' },
      { status: storageNotConfigured ? 503 : 500 },
    );
  }
}
