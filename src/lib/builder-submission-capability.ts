import { createBuilderToken, hashBuilderToken } from './squad-invite';
import { createServiceRoleClient } from './supabase/server';

/**
 * httpOnly-cookie name for the normal (non-Squad-Invite) builder flow's
 * capability token — mirrors Squad Invite's own 'emblem_squad_builder'
 * cookie (src/app/api/squad-invite-links/participation/route.ts), a
 * separate cookie because the two flows are genuinely different
 * submissions with different lifetimes and no reason to share state.
 */
export const BUILDER_SUBMISSION_COOKIE = 'emblem_builder_submission';

const CAPABILITY_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Evidence-based limits, recalculated against the approved MVP pilot
 * decision that the direct multi-player builder is capped at
 * DIRECT_BUILDER_MAX_PAID_PLAYERS = 30 paid players
 * (order-enquiry-validation.ts). See the correction-pass report's
 * evidence table for the full trace, including the reconciled 401-vs-601
 * arithmetic error in an earlier draft (that draft's own table listed
 * photos, badges AND generated PDFs as if they summed to one "401 slots"
 * total — they don't: PDFs are never part of this ledger at all, see
 * below).
 *
 * A real order's ONLY /api/order-assets uploads are, per player: one
 * source photo (required) and one optional custom badge (only when the
 * player isn't on an official-club roster — see ProductionBuilder.tsx's
 * `player.badgeUrl && isLocalAssetUrl(player.badgeUrl)` guard) — plus
 * exactly one coach-card photo whenever the order is squad-tier (10+
 * players — pricing-engine.ts's coachCardEligible), which every 30-player
 * order necessarily is. Card front/back artwork is never uploaded here at
 * all: it's captured client-side and sent straight to /api/render-print as
 * an in-memory data URL, which uploads only the resulting print PDF (a
 * different S3 prefix, a different endpoint, a different ledger entirely
 * — never counted against these limits). Cropping/background-removal
 * happen client-side before the single resulting image is uploaded — there
 * is no separate "processed photo" object.
 *
 * Real maximum slots for the largest approved direct order: 30 players x
 * (1 photo + 1 badge) + 1 coach photo = 61.
 */
export const MAX_ASSET_COUNT_PER_BUILDER_SUBMISSION = 75; // slots; 61 real max + ~23% margin

/**
 * Slot-based accounting (see builder_submission_assets, migration 0068)
 * means a REPLACEMENT never re-adds the full size — only the byte delta —
 * so this ceiling only needs to cover the largest realistic ONE-TIME total
 * across 61 distinct slots, not a multiplied-up retry allowance.
 *
 * Calculation: 30 photos, generously assumed ALL near the 18MB per-file
 * ceiling (a real phone photo can genuinely be this large) = 540MB: + 30
 * badges at a realistic ~2MB each (a small club-crest/logo image never
 * plausibly approaches 18MB in real use) = 60MB; + 1 coach photo at 18MB =
 * 18MB. Total realistic-worst-case ~618MB, +~30% margin ~= 800MiB.
 * Deliberately NOT sized as if every badge could also be 18MB (61 x 18MB =
 * ~1.07GB) — that assumption isn't what this app's real badge uploads look
 * like, and the earlier 3GiB/5GiB ceilings were rejected for exactly this
 * kind of unevidenced worst-case inflation.
 */
export const MAX_TOTAL_UPLOAD_BYTES_PER_BUILDER_SUBMISSION = 800 * 1024 * 1024; // 800MiB

export interface IssuedBuilderSubmission {
  submissionId: string;
  token: string;
  expiresAt: Date;
}

/** Generates a new capability and persists only its hash. */
export async function issueBuilderSubmissionCapability(): Promise<IssuedBuilderSubmission> {
  const { token, hash } = createBuilderToken();
  const expiresAt = new Date(Date.now() + CAPABILITY_LIFETIME_MS);
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('issue_builder_submission_capability', {
    p_token_hash: hash,
    p_expires_at: expiresAt.toISOString(),
  });
  if (error || !data) throw new Error('Could not issue a builder submission capability');
  return { submissionId: data as string, token, expiresAt };
}

/**
 * Pure authentication check: verifies a raw capability token and returns
 * the bound submission id, or null on ANY failure (missing token, no
 * matching hash, expired, or not in the 'active' state — finalising/
 * submitted/revoked all block equally). Deliberately uniform: callers must
 * never branch on *why* verification failed, only that it did.
 *
 * Carries no ceiling/byte concept any more (Gate 1 upload-limit closure
 * pass) — render-print calls this alone (it has nothing to account for);
 * order-assets calls this for auth, then separately calls
 * reserveBuilderSubmissionAssetSlot for capacity accounting.
 */
export async function verifyBuilderSubmissionCapability(rawToken: string | undefined): Promise<string | null> {
  if (!rawToken) return null;
  const hash = hashBuilderToken(rawToken);
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('verify_and_touch_builder_submission_capability', {
    p_token_hash: hash,
  });
  if (error || !data) return null;
  return data as string;
}

export interface AssetSlotReservation {
  ok: boolean;
  /** null for a brand-new slot; the slot's prior size for a replacement. Pass this to releaseBuilderSubmissionAssetSlot verbatim if the S3 write that follows fails. */
  previousBytes: number | null;
  /**
   * This reservation's own identity, freshly generated by the database on
   * every successful reserve (migration 0068's reservation_id column) —
   * null when ok is false. Not an auth capability: it only ever proves
   * "which attempt", never "who's allowed" (that's still the submission's
   * own token). Never log this value — see finishBuilderSubmissionAssetReservation.
   * A caller must present THIS EXACT value back to
   * finishBuilderSubmissionAssetReservation/releaseBuilderSubmissionAssetSlot;
   * a second, later reservation for the same slot mints its own, different
   * id, which is exactly what lets the database tell a stale caller apart
   * from the current one (see those functions' own comments).
   */
  reservationId: string | null;
}

/**
 * Reserves capacity for one stable logical asset slot (e.g. `${playerId}:
 * photo`, `${playerId}:badge`, 'coach:photo') BEFORE the caller uploads to
 * S3 — see migration 0068's own comment on reserve_builder_submission_
 * asset_slot for why this ordering (not upload-then-account) is what keeps
 * accounting correct for a replacement that would grow past the ceiling.
 * Fails closed (returns ok:false) on any database error.
 */
export async function reserveBuilderSubmissionAssetSlot(
  submissionId: string,
  slotKey: string,
  bytes: number,
): Promise<AssetSlotReservation> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('reserve_builder_submission_asset_slot', {
    p_id: submissionId,
    p_slot_key: slotKey,
    p_bytes: bytes,
    p_max_count: MAX_ASSET_COUNT_PER_BUILDER_SUBMISSION,
    p_max_total_bytes: MAX_TOTAL_UPLOAD_BYTES_PER_BUILDER_SUBMISSION,
  });
  if (error || !data || !data[0]) return { ok: false, previousBytes: null, reservationId: null };
  const row = data[0] as { ok: boolean; previous_bytes: number | null; reservation_id: string | null };
  return { ok: row.ok, previousBytes: row.previous_bytes, reservationId: row.reservation_id };
}

/**
 * Confirms whether `reservationId` (as returned by
 * reserveBuilderSubmissionAssetSlot) is still THE CURRENT reservation for
 * this slot — i.e. no later reservation has since replaced it. Call this
 * after the S3 upload to a reservation-specific temporary key succeeds,
 * before promoting that object to its stable final key:
 *   - true  -> this reservation won the race; safe to copyObject the
 *     temporary key onto the slot's final key, then delete the temporary
 *     key (see order-assets/route.ts).
 *   - false -> a newer reservation already replaced this one (the
 *     concurrent-same-slot-replacement case); do NOT promote — only
 *     delete this attempt's now-orphaned temporary object. The route must
 *     treat this as a safe, generic "superseded" outcome for the caller,
 *     never as a hard error, since the slot itself is already correctly
 *     served by the newer upload.
 * Fails closed (returns false) on any database error — an unconfirmed
 * reservation is never promoted.
 */
export async function finishBuilderSubmissionAssetReservation(
  submissionId: string,
  slotKey: string,
  reservationId: string,
): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc('finish_builder_submission_asset_reservation', {
      p_id: submissionId,
      p_slot_key: slotKey,
      p_reservation_id: reservationId,
    });
    if (error) {
      console.error('builder-submission-capability: finish-reservation failed', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('builder-submission-capability: finish-reservation failed', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}

/**
 * Reverses a reservation made by reserveBuilderSubmissionAssetSlot when
 * the S3 write that was supposed to follow it failed instead. Gated on
 * `reservationId` still matching the slot's CURRENT reservation (migration
 * 0068's release_builder_submission_asset_slot, identity-based rather than
 * matching on the byte value) — a since-superseded reservation's release
 * is a safe no-op that returns false, and can never restore stale byte
 * accounting over, delete the ledger row of, or otherwise disturb whatever
 * a later, successful reservation already committed. Never throws: a
 * release failure is logged (operationally detectable) but must never
 * block the error response already being returned for the original S3
 * failure. Returns whether the release actually took effect (true) or was
 * a stale/already-superseded no-op (false) — callers may use this for
 * logging/metrics but must never treat false as an error to surface.
 */
export async function releaseBuilderSubmissionAssetSlot(
  submissionId: string,
  slotKey: string,
  reservationId: string,
  previousBytes: number | null,
): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc('release_builder_submission_asset_slot', {
      p_id: submissionId,
      p_slot_key: slotKey,
      p_reservation_id: reservationId,
      p_previous_bytes: previousBytes,
    });
    if (error) {
      console.error('builder-submission-capability: release-slot failed', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('builder-submission-capability: release-slot failed', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}

export type BuilderSubmissionFinalisingResult = 'finalising' | 'submitted' | 'revoked' | 'expired' | 'not_found';

/**
 * Begins the finalising transition for order-enquiry — the instant this
 * commits, the capability stops authorising any further upload/render
 * call, closing the window a purely-post-success revoke would leave open.
 * See migration 0068's own comment on begin_builder_submission_finalising
 * for exactly what each returned state means to the caller.
 */
export async function beginBuilderSubmissionFinalising(submissionId: string): Promise<BuilderSubmissionFinalisingResult> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('begin_builder_submission_finalising', { p_id: submissionId });
  if (error || !data) return 'not_found';
  return data as BuilderSubmissionFinalisingResult;
}

/**
 * Completes the finalising transition — 'submitted' on success, back to
 * 'active' on a genuine failure so the customer isn't permanently locked
 * out of retrying with the same capability. Never throws: a failure here
 * must never block the customer-facing order-enquiry response, and
 * leaves the capability safely stuck in 'finalising' (still upload/render-
 * blocking) rather than reverting to a permissive state — logged so it's
 * operationally detectable, not silent.
 */
export async function finishBuilderSubmissionFinalising(submissionId: string, success: boolean): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.rpc('finish_builder_submission_finalising', { p_id: submissionId, p_success: success });
    if (error) {
      console.error('builder-submission-capability: finish-finalising failed', error.message);
    }
  } catch (err) {
    console.error('builder-submission-capability: finish-finalising failed', err instanceof Error ? err.message : 'unknown error');
  }
}

/**
 * Explicit abandon/staff-recovery path — works by capability id alone,
 * never the raw token (staff never has or needs it to recover a stuck
 * submission). Best-effort and idempotent: revoking an already-revoked/
 * submitted/expired id is a silent no-op. Never throws: a revoke failure
 * must never block the customer-facing response it's attached to.
 */
export async function revokeBuilderSubmissionCapability(submissionId: string): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.rpc('revoke_builder_submission_capability', { p_id: submissionId });
    if (error) {
      console.error('builder-submission-capability: revoke failed', error.message);
    }
  } catch (err) {
    console.error('builder-submission-capability: revoke failed', err instanceof Error ? err.message : 'unknown error');
  }
}
