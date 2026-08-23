import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
vi.mock('./supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

import {
  issueBuilderSubmissionCapability,
  verifyBuilderSubmissionCapability,
  revokeBuilderSubmissionCapability,
  beginBuilderSubmissionFinalising,
  finishBuilderSubmissionFinalising,
  reserveBuilderSubmissionAssetSlot,
  releaseBuilderSubmissionAssetSlot,
  finishBuilderSubmissionAssetReservation,
  MAX_ASSET_COUNT_PER_BUILDER_SUBMISSION,
  MAX_TOTAL_UPLOAD_BYTES_PER_BUILDER_SUBMISSION,
} from './builder-submission-capability';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('issueBuilderSubmissionCapability', () => {
  it('generates a cryptographically random raw token, never persists it, and returns the server-assigned id', async () => {
    mockRpc.mockResolvedValue({ data: '11111111-1111-1111-1111-111111111111', error: null });
    const result = await issueBuilderSubmissionCapability();
    expect(result.submissionId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, 32 bytes
    const call = mockRpc.mock.calls[0];
    expect(call[0]).toBe('issue_builder_submission_capability');
    // Only the hash is ever sent to the database — never the raw token.
    expect(call[1].p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(call[1].p_token_hash).not.toBe(result.token);
  });

  it('two issuances never produce the same raw token or hash', async () => {
    mockRpc.mockResolvedValue({ data: '11111111-1111-1111-1111-111111111111', error: null });
    const a = await issueBuilderSubmissionCapability();
    const b = await issueBuilderSubmissionCapability();
    expect(a.token).not.toBe(b.token);
  });

  it('sets a 24-hour expiry', async () => {
    mockRpc.mockResolvedValue({ data: '11111111-1111-1111-1111-111111111111', error: null });
    const before = Date.now();
    const result = await issueBuilderSubmissionCapability();
    const hours = (result.expiresAt.getTime() - before) / (1000 * 60 * 60);
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
  });

  it('throws if the database rejects issuance', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db error' } });
    await expect(issueBuilderSubmissionCapability()).rejects.toThrow();
  });
});

describe('verifyBuilderSubmissionCapability', () => {
  it('returns null for a missing token without ever calling the database', async () => {
    const result = await verifyBuilderSubmissionCapability(undefined);
    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the bound submission id for a token the database accepts — pure auth, no ceiling concept', async () => {
    mockRpc.mockResolvedValue({ data: '11111111-1111-1111-1111-111111111111', error: null });
    const result = await verifyBuilderSubmissionCapability('some-raw-token');
    expect(result).toBe('11111111-1111-1111-1111-111111111111');
    expect(mockRpc).toHaveBeenCalledWith('verify_and_touch_builder_submission_capability', {
      p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('returns null uniformly for a database error and for a genuinely unmatched token — never distinguishable', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const a = await verifyBuilderSubmissionCapability('unmatched-token');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const b = await verifyBuilderSubmissionCapability('also-unmatched');
    expect(a).toBe(b);
    expect(a).toBeNull();
  });
});

describe('reserveBuilderSubmissionAssetSlot', () => {
  it('calls the reserve RPC with the submission id, slot key, bytes and the named ceiling constants, and surfaces the fresh reservationId', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: true, previous_bytes: null, reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null });
    const result = await reserveBuilderSubmissionAssetSlot('11111111-1111-1111-1111-111111111111', 'p1:photo', 12345);
    expect(result).toEqual({ ok: true, previousBytes: null, reservationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    expect(mockRpc).toHaveBeenCalledWith('reserve_builder_submission_asset_slot', {
      p_id: '11111111-1111-1111-1111-111111111111',
      p_slot_key: 'p1:photo',
      p_bytes: 12345,
      p_max_count: MAX_ASSET_COUNT_PER_BUILDER_SUBMISSION,
      p_max_total_bytes: MAX_TOTAL_UPLOAD_BYTES_PER_BUILDER_SUBMISSION,
    });
  });

  it('surfaces previousBytes for a genuine replacement', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: true, previous_bytes: 999, reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null });
    const result = await reserveBuilderSubmissionAssetSlot('id', 'p1:photo', 12345);
    expect(result.previousBytes).toBe(999);
  });

  it('fails closed on a database error, with a null reservationId', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await reserveBuilderSubmissionAssetSlot('id', 'p1:photo', 12345);
    expect(result.ok).toBe(false);
    expect(result.reservationId).toBeNull();
  });

  it('fails closed when the ceiling itself rejects, with a null reservationId', async () => {
    mockRpc.mockResolvedValue({ data: [{ ok: false, previous_bytes: null, reservation_id: null }], error: null });
    const result = await reserveBuilderSubmissionAssetSlot('id', 'p1:photo', 12345);
    expect(result.ok).toBe(false);
    expect(result.reservationId).toBeNull();
  });

  it('two successive reservations for the same slot get different reservationIds — the identity the version-safety design depends on', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ ok: true, previous_bytes: null, reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null });
    const a = await reserveBuilderSubmissionAssetSlot('id', 'p1:photo', 100);
    mockRpc.mockResolvedValueOnce({ data: [{ ok: true, previous_bytes: 100, reservation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }], error: null });
    const b = await reserveBuilderSubmissionAssetSlot('id', 'p1:photo', 200);
    expect(a.reservationId).not.toBe(b.reservationId);
  });
});

describe('finishBuilderSubmissionAssetReservation', () => {
  it('calls the finish RPC with the submission id, slot key and reservationId, and returns true when it is still current', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await finishBuilderSubmissionAssetReservation('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('finish_builder_submission_asset_reservation', {
      p_id: 'id',
      p_slot_key: 'p1:photo',
      p_reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
  });

  it('returns false when a newer reservation has superseded this one', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await finishBuilderSubmissionAssetReservation('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result).toBe(false);
  });

  it('fails closed (false) on a database error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await finishBuilderSubmissionAssetReservation('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result).toBe(false);
  });

  it('fails closed (false), never throws, if the underlying call rejects', async () => {
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(finishBuilderSubmissionAssetReservation('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).resolves.toBe(false);
  });
});

describe('releaseBuilderSubmissionAssetSlot', () => {
  it('calls the release RPC with the reservationId (not a byte value) and the previous bytes, and returns whether it actually matched', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await releaseBuilderSubmissionAssetSlot('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 999);
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('release_builder_submission_asset_slot', {
      p_id: 'id',
      p_slot_key: 'p1:photo',
      p_reservation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_previous_bytes: 999,
    });
  });

  it('returns false (a safe no-op) when the reservationId no longer matches the slot\'s current one — a stale release', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await releaseBuilderSubmissionAssetSlot('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 999);
    expect(result).toBe(false);
  });

  it('never throws even if the underlying call fails, and resolves to false', async () => {
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(releaseBuilderSubmissionAssetSlot('id', 'p1:photo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null)).resolves.toBe(false);
  });
});

describe('revokeBuilderSubmissionCapability', () => {
  it('calls the revoke RPC with the given id — capability id alone, never the raw token', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await revokeBuilderSubmissionCapability('11111111-1111-1111-1111-111111111111');
    expect(mockRpc).toHaveBeenCalledWith('revoke_builder_submission_capability', { p_id: '11111111-1111-1111-1111-111111111111' });
  });

  it('never throws even if the underlying call fails', async () => {
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(revokeBuilderSubmissionCapability('11111111-1111-1111-1111-111111111111')).resolves.toBeUndefined();
  });

  it('logs a database-reported error without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'row not found' } });
    await revokeBuilderSubmissionCapability('11111111-1111-1111-1111-111111111111');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('beginBuilderSubmissionFinalising', () => {
  it('returns "finalising" when the transition just happened', async () => {
    mockRpc.mockResolvedValue({ data: 'finalising', error: null });
    const result = await beginBuilderSubmissionFinalising('11111111-1111-1111-1111-111111111111');
    expect(result).toBe('finalising');
    expect(mockRpc).toHaveBeenCalledWith('begin_builder_submission_finalising', { p_id: '11111111-1111-1111-1111-111111111111' });
  });

  it('returns "submitted" for an already-completed submission', async () => {
    mockRpc.mockResolvedValue({ data: 'submitted', error: null });
    const result = await beginBuilderSubmissionFinalising('11111111-1111-1111-1111-111111111111');
    expect(result).toBe('submitted');
  });

  it('returns "not_found" uniformly on a database error or a null/missing row', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const a = await beginBuilderSubmissionFinalising('id-a');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const b = await beginBuilderSubmissionFinalising('id-b');
    expect(a).toBe('not_found');
    expect(b).toBe('not_found');
  });
});

describe('finishBuilderSubmissionFinalising', () => {
  it('calls finish with p_success:true on success', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await finishBuilderSubmissionFinalising('11111111-1111-1111-1111-111111111111', true);
    expect(mockRpc).toHaveBeenCalledWith('finish_builder_submission_finalising', {
      p_id: '11111111-1111-1111-1111-111111111111',
      p_success: true,
    });
  });

  it('calls finish with p_success:false on failure, to release back to active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await finishBuilderSubmissionFinalising('11111111-1111-1111-1111-111111111111', false);
    expect(mockRpc).toHaveBeenCalledWith('finish_builder_submission_finalising', {
      p_id: '11111111-1111-1111-1111-111111111111',
      p_success: false,
    });
  });

  it('never throws even if the underlying call fails, and logs the failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockRejectedValue(new Error('db unavailable'));
    await expect(finishBuilderSubmissionFinalising('11111111-1111-1111-1111-111111111111', true)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
