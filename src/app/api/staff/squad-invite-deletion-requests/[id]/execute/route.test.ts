import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...args: unknown[]) => mockRequireStaff(...args) }));

const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({ deleteObject: (key: string) => mockDeleteObject(key) }));
const mockDeletePhotoDayObject = vi.fn();
vi.mock('@/lib/photo-day-storage', () => ({ deletePhotoDayObject: (key: string) => mockDeletePhotoDayObject(key) }));

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
  // Read-only: the contact read before closing (0097). It has no rpc, so any
  // storage-attempt write through it would still fail the test.
  createServiceRoleClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockContactRow, error: null }) }) }) }),
  }),
}));
let mockContactRow: { status: string; requester_email: string | null } | null = { status: 'pending', requester_email: 'guardian@example.test' };

const REQUEST_ID = 'participation-request-1';

function execute(note = 'Verified by staff, erasure complete.') {
  return POST(new Request(`http://localhost/api/staff/squad-invite-deletion-requests/${REQUEST_ID}/execute`, { method: 'POST', body: JSON.stringify({ note }) }), {
    params: { id: REQUEST_ID },
  });
}

beforeEach(() => {
  mockRequireStaff.mockReset();
  mockDeleteObject.mockReset();
  mockDeletePhotoDayObject.mockReset();
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
    expect(await res.json()).not.toHaveProperty('contactEmail');
  });
});

describe('POST /api/staff/squad-invite-deletion-requests/[id]/execute — contact shown once (0097)', () => {
  const finalizeWith = (outcome: object) =>
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') return Promise.resolve({ data: { alreadyCompleted: false, inventory: [] }, error: null });
      if (name === 'finalize_squad_invite_participation_erasure') return Promise.resolve({ data: outcome, error: null });
      throw new Error(`unexpected rpc ${name}`);
    });

  it('returns the pending request\'s contact address only when this call completed it', async () => {
    mockContactRow = { status: 'pending', requester_email: 'guardian@example.test' };
    finalizeWith({ completed: true });
    expect(await (await execute()).json()).toEqual({ ok: true, completed: true, contactEmail: 'guardian@example.test' });
  });

  it('a request still pending (storage or supplier step outstanding) returns no address', async () => {
    mockContactRow = { status: 'pending', requester_email: 'guardian@example.test' };
    finalizeWith({ completed: false, state: 'awaiting_supplier_action' });
    expect(await (await execute()).json()).not.toHaveProperty('contactEmail');
  });

  it('an already-closed request has no address to return', async () => {
    mockContactRow = { status: 'completed', requester_email: null };
    finalizeWith({ completed: true });
    expect((await (await execute()).json()).contactEmail).toBeNull();
  });
});

describe('POST /api/staff/squad-invite-deletion-requests/[id]/execute — Photo Day bucket', () => {
  it('deletes photo_day_photo objects from the Photo Day bucket and everything else from the main bucket', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [
          { id: 'obj-1', s3Key: 'order-assets/p1/photo.jpg', kind: 'participation_photo' },
          { id: 'obj-2', s3Key: 'photo-day/d1/x.jpg', kind: 'photo_day_photo' },
        ] }, error: null });
      }
      if (name === 'record_squad_invite_deletion_storage_attempt') return Promise.resolve({ data: {}, error: null });
      if (name === 'finalize_squad_invite_participation_erasure') return Promise.resolve({ data: { completed: true }, error: null });
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeleteObject.mockResolvedValue(undefined);
    mockDeletePhotoDayObject.mockResolvedValue(undefined);

    const res = await execute();
    expect(res.status).toBe(200);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject).toHaveBeenCalledWith('order-assets/p1/photo.jpg');
    expect(mockDeletePhotoDayObject).toHaveBeenCalledTimes(1);
    expect(mockDeletePhotoDayObject).toHaveBeenCalledWith('photo-day/d1/x.jpg');
  });

  it('records a failed Photo Day delete (e.g. storage not configured) instead of marking it deleted', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'confirm_squad_invite_participation_erasure') {
        return Promise.resolve({ data: { alreadyCompleted: false, inventory: [{ id: 'obj-2', s3Key: 'photo-day/d1/x.jpg', kind: 'photo_day_photo' }] }, error: null });
      }
      if (name === 'record_squad_invite_deletion_storage_attempt') return Promise.resolve({ data: {}, error: null });
      if (name === 'finalize_squad_invite_participation_erasure') return Promise.resolve({ data: { completed: false }, error: null });
      throw new Error(`unexpected rpc ${name}`);
    });
    mockDeletePhotoDayObject.mockRejectedValue(new Error('PHOTO_DAY_S3_BUCKET is not set'));

    await execute();
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('record_squad_invite_deletion_storage_attempt', { p_object_id: 'obj-2', p_deleted: false, p_error: 'PHOTO_DAY_S3_BUCKET is not set' });
  });
});
