import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...args: unknown[]) => mockRequireStaff(...args) }));

const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({ deleteObject: (key: string) => mockDeleteObject(key) }));

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
  createServiceRoleClient: () => {
    throw new Error('this route must not use the service-role client for storage-attempt writes');
  },
}));

const REQUEST_ID = 'request-1';

function complete(note = 'Verified by staff, erasure complete.') {
  return POST(new Request(`http://localhost/api/staff/deletion-requests/${REQUEST_ID}/complete`, { method: 'POST', body: JSON.stringify({ note }) }), {
    params: { id: REQUEST_ID },
  });
}

beforeEach(() => {
  mockRequireStaff.mockReset();
  mockDeleteObject.mockReset();
  mockRpc.mockReset();
  mockRequireStaff.mockResolvedValue({ ok: true, userId: 'staff-1' });
});

describe('POST /api/staff/deletion-requests/[id]/complete — attempt counting', () => {
  it('records the first attempt via the atomic RPC, never a raw table update', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_player_deletion_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'player_photo' }] }, error: null });
      }
      if (name === 'record_player_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'deleted', attempts: 1 }, error: null });
      }
      if (name === 'finalize_player_deletion_erasure') {
        return Promise.resolve({ data: { completed: true }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockResolvedValue(undefined);

    const res = await complete();
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_player_deletion_storage_attempt', { p_object_id: 'obj-1', p_deleted: true, p_error: null });
  });

  it('a failed S3 delete followed by a successful retry both go through the same atomic RPC — the count is entirely DB-derived, never assembled in Node', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_player_deletion_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, resumed: false, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'player_photo' }] }, error: null });
      }
      if (name === 'record_player_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'failed', attempts: 1 }, error: null });
      }
      if (name === 'finalize_player_deletion_erasure') {
        return Promise.resolve({ data: { completed: false, state: 'failed' }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockRejectedValueOnce(new Error('S3 unavailable'));

    await complete();
    expect(mockRpc).toHaveBeenCalledWith('record_player_deletion_storage_attempt', { p_object_id: 'obj-1', p_deleted: false, p_error: 'S3 unavailable' });

    // A second execute call (the retry) — the route never reads the prior
    // attempts count itself; it just reports this call's outcome and lets
    // the RPC do the increment.
    mockRpc.mockReset();
    mockRequireStaff.mockResolvedValue({ ok: true, userId: 'staff-1' });
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_player_deletion_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, resumed: true, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'player_photo' }] }, error: null });
      }
      if (name === 'record_player_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'deleted', attempts: 2 }, error: null });
      }
      if (name === 'finalize_player_deletion_erasure') {
        return Promise.resolve({ data: { completed: true }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockResolvedValueOnce(undefined);

    await complete();
    expect(mockRpc).toHaveBeenCalledWith('record_player_deletion_storage_attempt', { p_object_id: 'obj-1', p_deleted: true, p_error: null });
  });

  it('never sends an attempts value of any kind to the RPC — the client cannot set or overwrite the counter', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_player_deletion_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'player_photo' }] }, error: null });
      }
      if (name === 'record_player_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'deleted', attempts: 1 }, error: null });
      }
      if (name === 'finalize_player_deletion_erasure') {
        return Promise.resolve({ data: { completed: true }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockResolvedValue(undefined);

    await complete();
    const attemptCall = mockRpc.mock.calls.find((call) => call[0] === 'record_player_deletion_storage_attempt');
    expect(attemptCall?.[1]).not.toHaveProperty('attempts');
    expect(attemptCall?.[1]).not.toHaveProperty('p_attempts');
  });

  it('an already-completed request short-circuits before the loop — no attempt is recorded for an idempotent completion call', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_player_deletion_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: true, inventory: [] }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const res = await complete();
    expect(res.status).toBe(200);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('record_player_deletion_storage_attempt', expect.anything());
  });
});
