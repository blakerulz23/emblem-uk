import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
vi.mock('./supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

import {
  reserveSquadInviteParticipationAssetSlot,
  releaseSquadInviteParticipationAssetSlot,
  finishSquadInviteParticipationAssetReservation,
  MAX_ASSET_COUNT_PER_SQUAD_PARTICIPATION,
  MAX_TOTAL_UPLOAD_BYTES_PER_SQUAD_PARTICIPATION,
} from './squad-invite-participation-assets';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('reserveSquadInviteParticipationAssetSlot', () => {
  it('calls the reserve RPC with the participation id, hashed token, slot key, bytes and the named ceiling constants, and surfaces the fresh reservationId', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: true, previous_bytes: null, reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null });
    const result = await reserveSquadInviteParticipationAssetSlot('participation-1', 'hashed-token', 'child:photo', 12345);
    expect(result).toEqual({ ok: true, previousBytes: null, reservationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    expect(mockRpc).toHaveBeenCalledWith('reserve_squad_invite_participation_asset_slot', {
      p_participation_id: 'participation-1',
      p_builder_token_hash: 'hashed-token',
      p_slot_key: 'child:photo',
      p_bytes: 12345,
      p_max_count: MAX_ASSET_COUNT_PER_SQUAD_PARTICIPATION,
      p_max_total_bytes: MAX_TOTAL_UPLOAD_BYTES_PER_SQUAD_PARTICIPATION,
    });
  });

  it('surfaces previousBytes for a genuine replacement', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: true, previous_bytes: 4321, reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null });
    const result = await reserveSquadInviteParticipationAssetSlot('participation-1', 'hashed-token', 'child:photo', 12345);
    expect(result.previousBytes).toBe(4321);
  });

  it('fails closed on a database error, with a null reservationId', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await reserveSquadInviteParticipationAssetSlot('participation-1', 'hashed-token', 'child:photo', 12345);
    expect(result.ok).toBe(false);
    expect(result.reservationId).toBeNull();
  });

  it('fails closed when ownership or the ceiling itself rejects, with a null reservationId', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: false, previous_bytes: null, reservation_id: null }], error: null });
    const result = await reserveSquadInviteParticipationAssetSlot('participation-1', 'wrong-hash', 'child:photo', 12345);
    expect(result.ok).toBe(false);
    expect(result.reservationId).toBeNull();
  });
});

describe('finishSquadInviteParticipationAssetReservation', () => {
  it('calls the finish RPC with the participation id, slot key and reservationId, and returns true when still current', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await finishSquadInviteParticipationAssetReservation('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('finish_squad_invite_participation_asset_reservation', {
      p_participation_id: 'participation-1',
      p_slot_key: 'child:photo',
      p_reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
  });

  it('returns false when a newer reservation has superseded this one', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await finishSquadInviteParticipationAssetReservation('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result).toBe(false);
  });

  it('fails closed (false), never throws, if the underlying call rejects', async () => {
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(finishSquadInviteParticipationAssetReservation('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).resolves.toBe(false);
  });
});

describe('releaseSquadInviteParticipationAssetSlot', () => {
  it('calls the release RPC with the reservationId (not a byte value) and the previous bytes', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await releaseSquadInviteParticipationAssetSlot('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4321);
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('release_squad_invite_participation_asset_slot', {
      p_participation_id: 'participation-1',
      p_slot_key: 'child:photo',
      p_reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_previous_bytes: 4321,
    });
  });

  it('returns false (a safe no-op) for a stale release whose reservationId no longer matches', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await releaseSquadInviteParticipationAssetSlot('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4321);
    expect(result).toBe(false);
  });

  it('never throws even if the underlying call fails, and logs the failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(releaseSquadInviteParticipationAssetSlot('participation-1', 'child:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('named limit constants', () => {
  it('states the count and byte units clearly and keeps them small relative to real needs (one child, one photo slot)', () => {
    expect(MAX_ASSET_COUNT_PER_SQUAD_PARTICIPATION).toBe(5);
    expect(MAX_TOTAL_UPLOAD_BYTES_PER_SQUAD_PARTICIPATION).toBe(100 * 1024 * 1024);
  });
});
