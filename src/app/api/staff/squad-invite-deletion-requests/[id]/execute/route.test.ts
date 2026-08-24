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

const REQUEST_ID = 'participation-request-1';

function execute(note = 'Verified by staff, erasure complete.') {
  return POST(new Request(`http://localhost/api/staff/squad-invite-deletion-requests/${REQUEST_ID}/execute`, { method: 'POST', body: JSON.stringify({ note }) }), {
    params: { id: REQUEST_ID },
  });
}

beforeEach(() => {
  mockRequireStaff.mockReset();
  mockDeleteObject.mockReset();
  mockRpc.mockReset();
  mockRequireStaff.mockResolvedValue({ ok: true, userId: 'staff-1' });
});

describe('POST /api/staff/squad-invite-deletion-requests/[id]/execute — attempt counting', () => {
  it('records a successful delete via the atomic RPC', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'participation_photo' }] }, error: null });
      }
      if (name === 'record_squad_invite_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'deleted', attempts: 1 }, error: null });
      }
      if (name === 'finalize_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { completed: true }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockResolvedValue(undefined);

    const res = await execute();
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_squad_invite_deletion_storage_attempt', { p_object_id: 'obj-1', p_deleted: true, p_error: null });
  });

  it('records a failed delete via the atomic RPC with the error message, never a client-set attempts value', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [{ id: 'obj-1', s3Key: 'k1', kind: 'participation_photo' }] }, error: null });
      }
      if (name === 'record_squad_invite_deletion_storage_attempt') {
        return Promise.resolve({ data: { id: 'obj-1', status: 'failed', attempts: 1 }, error: null });
      }
      if (name === 'finalize_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { completed: false, state: 'failed' }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockRejectedValueOnce(new Error('S3 unavailable'));

    await execute();
    const attemptCall = mockRpc.mock.calls.find((call) => call[0] === 'record_squad_invite_deletion_storage_attempt');
    expect(attemptCall?.[1]).toEqual({ p_object_id: 'obj-1', p_deleted: false, p_error: 'S3 unavailable' });
    expect(attemptCall?.[1]).not.toHaveProperty('attempts');
  });

  it('an already-completed request short-circuits before the loop — no attempt is recorded', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: true, inventory: [] }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const res = await execute();
    expect(res.status).toBe(200);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('record_squad_invite_deletion_storage_attempt', expect.anything());
  });
});
