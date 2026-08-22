import { createServiceRoleClient } from './supabase/server';

/**
 * Gate 1 upload-limit closure pass — per-participation asset ceilings for
 * Squad Invite's own branch of /api/order-assets (a parent uploading their
 * child's photo). Previously this branch had no aggregate ceiling of any
 * kind: any number of uploads of any size (up to the shared per-file cap)
 * were accepted indefinitely against one participation.
 *
 * Real usage is exactly one stable slot: 'child:photo' — the single photo
 * a parent attaches to their child's card (see commit/route.ts's
 * body.photo.storageKey, ProductionBuilder.tsx's submitSquadInviteCommitment
 * calling uploadOrderAsset with playerId:'child', kind:'photo'). A parent
 * may retake/crop/replace that photo a few times before committing, but
 * each replacement updates the SAME slot (see
 * squad_invite_participation_assets, migration 0070) rather than adding a
 * new one.
 */
export const MAX_ASSET_COUNT_PER_SQUAD_PARTICIPATION = 5; // slots; real need is 1, generous headroom for future asset kinds
export const MAX_TOTAL_UPLOAD_BYTES_PER_SQUAD_PARTICIPATION = 100 * 1024 * 1024; // 100MiB — comfortably covers 5 max-size (18MB) photo slots

export interface AssetSlotReservation {
  ok: boolean;
  previousBytes: number | null;
  /** This reservation's own identity — see builder-submission-capability.ts's
   * AssetSlotReservation.reservationId for the full explanation. Null when
   * ok is false. Never log this value. */
  reservationId: string | null;
}

/**
 * Reserves capacity for one stable logical asset slot for a Squad Invite
 * participation BEFORE the caller uploads to S3 — same reserve-before-
 * upload rationale as builder-submission-capability.ts's equivalent.
 * Verifies ownership (builderTokenHash must match this exact
 * participation, which must still be 'started') in the same call.
 */
export async function reserveSquadInviteParticipationAssetSlot(
  participationId: string,
  builderTokenHash: string,
  slotKey: string,
  bytes: number,
): Promise<AssetSlotReservation> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('reserve_squad_invite_participation_asset_slot', {
    p_participation_id: participationId,
    p_builder_token_hash: builderTokenHash,
    p_slot_key: slotKey,
    p_bytes: bytes,
    p_max_count: MAX_ASSET_COUNT_PER_SQUAD_PARTICIPATION,
    p_max_total_bytes: MAX_TOTAL_UPLOAD_BYTES_PER_SQUAD_PARTICIPATION,
  });
  if (error || !data || !data[0]) return { ok: false, previousBytes: null, reservationId: null };
  const row = data[0] as { ok: boolean; previous_bytes: number | null; reservation_id: string | null };
  return { ok: row.ok, previousBytes: row.previous_bytes, reservationId: row.reservation_id };
}

/**
 * Confirms whether `reservationId` is still THE CURRENT reservation for
 * this slot — see builder-submission-capability.ts's
 * finishBuilderSubmissionAssetReservation for the full explanation (this
 * mirrors it exactly, one table over). Fails closed (false) on any
 * database error.
 */
export async function finishSquadInviteParticipationAssetReservation(
  participationId: string,
  slotKey: string,
  reservationId: string,
): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc('finish_squad_invite_participation_asset_reservation', {
      p_participation_id: participationId,
      p_slot_key: slotKey,
      p_reservation_id: reservationId,
    });
    if (error) {
      console.error('squad-invite-participation-assets: finish-reservation failed', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('squad-invite-participation-assets: finish-reservation failed', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}

/**
 * Reverses a reservation when the S3 write that was supposed to follow it
 * failed instead. Gated on `reservationId` still matching the slot's
 * CURRENT reservation — see builder-submission-capability.ts's
 * releaseBuilderSubmissionAssetSlot for the identical reasoning. Never
 * throws. Returns whether the release actually took effect (true) or was
 * a stale/already-superseded no-op (false).
 */
export async function releaseSquadInviteParticipationAssetSlot(
  participationId: string,
  slotKey: string,
  reservationId: string,
  previousBytes: number | null,
): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc('release_squad_invite_participation_asset_slot', {
      p_participation_id: participationId,
      p_slot_key: slotKey,
      p_reservation_id: reservationId,
      p_previous_bytes: previousBytes,
    });
    if (error) {
      console.error('squad-invite-participation-assets: release-slot failed', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('squad-invite-participation-assets: release-slot failed', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}
