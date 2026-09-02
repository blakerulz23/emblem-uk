import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  deleteObject: (key: string) => mockDeleteObject(key),
  // Same conclusive-not-found classification as the real helper — kept as
  // a hand-written stand-in (this codebase's established mocking
  // convention) rather than partially importing the real module. The real
  // implementation has its own direct unit tests in s3-client.test.ts.
  isS3NotFoundError: (err: unknown) => {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    return status === 404 || name === 'NotFound' || name === 'NoSuchKey';
  },
}));

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
}));

type Asset = { slot_key: string; reservation_id: string | null };

type Fixture = {
  capabilities: { id: string; state: string }[];
  builderAssets: Record<string, Asset[]>;
  participations: { id: string }[];
  squadAssets: Record<string, Asset[]>;
  // keyed `${table}:${idValue}:${slotKey}` -> error message, or absent for success
  deleteRowError: Record<string, string>;
};

let fixture: Fixture;
let deleteCalls: { table: string; idColumn: string; idValue: string; slotKey: string }[];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'builder_submission_capabilities') {
        return { select: () => ({ neq: () => ({ lt: async () => ({ data: fixture.capabilities }) }) }) };
      }
      if (table === 'squad_invite_participations') {
        return { select: () => ({ eq: () => ({ lt: async () => ({ data: fixture.participations }) }) }) };
      }
      if (table === 'builder_submission_assets' || table === 'squad_invite_participation_assets') {
        const isBuilder = table === 'builder_submission_assets';
        return {
          select: () => ({
            eq: async (_col: string, id: string) => ({ data: (isBuilder ? fixture.builderAssets : fixture.squadAssets)[id] ?? [] }),
          }),
          delete: () => ({
            eq: (idColumn: string, idValue: string) => ({
              eq: async (_slotCol: string, slotKey: string) => {
                deleteCalls.push({ table, idColumn, idValue, slotKey });
                const key = `${table}:${idValue}:${slotKey}`;
                const message = fixture.deleteRowError[key];
                return { error: message ? { message } : null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const ORIGINAL_ENV = { ...process.env };

function sweep() {
  return POST(
    new NextRequest('http://localhost/api/internal/cron/sweep-abandoned-uploads', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    })
  );
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-cron-secret' };
  mockDeleteObject.mockReset();
  mockEnqueueStaffNotification.mockReset();
  deleteCalls = [];
  fixture = { capabilities: [], builderAssets: {}, participations: [], squadAssets: {}, deleteRowError: {} };
});

describe('POST /api/internal/cron/sweep-abandoned-uploads', () => {
  it('successful S3 delete removes the tracking row', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockResolvedValue(undefined);

    const res = await sweep();
    const body = await res.json();

    expect(body.deleted).toBe(1);
    expect(body.alreadyAbsent).toBe(0);
    expect(body.retryable).toBe(0);
    expect(deleteCalls).toEqual([{ table: 'builder_submission_assets', idColumn: 'submission_id', idValue: 'cap-1', slotKey: 'front' }]);
  });

  it('object-not-found is treated as safely removable, not a failure', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValue({ name: 'NoSuchKey' });

    const res = await sweep();
    const body = await res.json();

    expect(body.alreadyAbsent).toBe(1);
    expect(body.deleted).toBe(0);
    expect(body.retryable).toBe(0);
    expect(deleteCalls).toHaveLength(1);
  });

  it('a transient S3 error preserves the tracking row for retry', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValue({ name: 'InternalError', $metadata: { httpStatusCode: 500 } });

    const res = await sweep();
    const body = await res.json();

    expect(body.retryable).toBe(1);
    expect(body.deleted).toBe(0);
    expect(body.alreadyAbsent).toBe(0);
    expect(deleteCalls).toHaveLength(0);
  });

  it('a permission error preserves the tracking row for retry', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValue({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });

    const res = await sweep();
    const body = await res.json();

    expect(body.retryable).toBe(1);
    expect(deleteCalls).toHaveLength(0);
  });

  it('a timeout preserves the tracking row for retry', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await sweep();
    const body = await res.json();

    expect(body.retryable).toBe(1);
    expect(deleteCalls).toHaveLength(0);
  });

  it('a database cleanup failure after a successful S3 delete is reported truthfully and stays retryable, not silently swallowed', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    fixture.deleteRowError['builder_submission_assets:cap-1:front'] = 'row lock timeout';
    mockDeleteObject.mockResolvedValue(undefined);

    const res = await sweep();
    const body = await res.json();

    expect(body.retryable).toBe(1);
    expect(body.deleted).toBe(0);
    expect(body.ok).toBe(false);
    // the S3 delete was attempted and reported as such, but nothing was
    // falsely marked deleted since the tracking row itself never cleared
    expect(mockDeleteObject).toHaveBeenCalledWith('order-assets/cap-1/front');
  });

  it('a retry after a prior failure succeeds once the transient condition clears', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const first = await sweep();
    expect((await first.json()).retryable).toBe(1);

    mockDeleteObject.mockResolvedValueOnce(undefined);
    const second = await sweep();
    const body = await second.json();
    expect(body.deleted).toBe(1);
    expect(body.retryable).toBe(0);
  });

  it('a mixed batch (deleted, already-absent, and retryable in the same sweep) reports accurate counts across both builder and Squad Invite paths', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [
      { slot_key: 'front', reservation_id: null },
      { slot_key: 'back', reservation_id: null },
    ];
    fixture.participations = [{ id: 'part-1' }];
    fixture.squadAssets['part-1'] = [{ slot_key: 'logo', reservation_id: null }];

    mockDeleteObject.mockImplementation((key: string) => {
      if (key === 'order-assets/cap-1/front') return Promise.resolve(undefined);
      if (key === 'order-assets/cap-1/back') return Promise.reject({ name: 'NotFound' });
      if (key === 'order-assets/part-1/logo') return Promise.reject(new Error('network blip'));
      throw new Error(`unexpected key ${key}`);
    });

    const res = await sweep();
    const body = await res.json();

    expect(body.deleted).toBe(1);
    expect(body.alreadyAbsent).toBe(1);
    expect(body.retryable).toBe(1);
    expect(body.ok).toBe(false);
    expect(body.builderSubmissions).toBe(1);
    expect(body.squadInviteParticipations).toBe(1);
  });

  it('a reservation-scoped pending key is also erased, and both keys must clear before the row is removed', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: 'res-1' }];
    mockDeleteObject.mockResolvedValue(undefined);

    await sweep();

    expect(mockDeleteObject).toHaveBeenCalledWith('order-assets/cap-1/front');
    expect(mockDeleteObject).toHaveBeenCalledWith('order-assets/cap-1/front.pending-res-1');
    expect(deleteCalls).toHaveLength(1);
  });

  it('never includes a raw storage key, slot key, or reservation id in the response body', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: 'res-1' }];
    mockDeleteObject.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await sweep();
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain('order-assets/');
    expect(raw).not.toContain('front');
    expect(raw).not.toContain('res-1');
  });

  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await POST(new NextRequest('http://localhost/api/internal/cron/sweep-abandoned-uploads', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('notifies staff when the sweep leaves retryable errors behind', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockRejectedValue(new Error('ETIMEDOUT'));

    await sweep();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; recipientScope: string; summary: Record<string, unknown> };
    expect(call.eventType).toBe('upload_sweep_errors');
    expect(call.recipientScope).toBe('all_staff');
    expect(call.summary.retryable).toBe(1);
  });

  it('never notifies staff when the whole sweep succeeds cleanly', async () => {
    fixture.capabilities = [{ id: 'cap-1', state: 'started' }];
    fixture.builderAssets['cap-1'] = [{ slot_key: 'front', reservation_id: null }];
    mockDeleteObject.mockResolvedValue(undefined);

    await sweep();

    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });
});
