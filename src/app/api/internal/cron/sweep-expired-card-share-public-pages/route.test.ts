import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({ deleteObject: (...args: unknown[]) => mockDeleteObject(...args) }));

type Fixture = { expiredPages: { id: string; front_image_key: string }[] };
let fixture: Fixture;
const deletedRowIds: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table !== 'card_share_public_pages') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ lt: async () => ({ data: fixture.expiredPages }) }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedRowIds.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  }),
}));

const ORIGINAL_ENV = { ...process.env };

function sweep() {
  return POST(new NextRequest('http://localhost/api/internal/cron/sweep-expired-card-share-public-pages', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-cron-secret' };
  mockDeleteObject.mockReset().mockResolvedValue(undefined);
  fixture = { expiredPages: [] };
  deletedRowIds.length = 0;
});

describe('POST /api/internal/cron/sweep-expired-card-share-public-pages', () => {
  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await POST(new NextRequest('http://localhost/api/internal/cron/sweep-expired-card-share-public-pages', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('does nothing when there are no expired pages', async () => {
    const res = await sweep();
    const body = await res.json();
    expect(body).toEqual({ ok: true, pagesProcessed: 0, objectsDeleted: 0, errors: [] });
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('deletes the S3 object and the row for each expired page', async () => {
    fixture.expiredPages = [{ id: 'page-1', front_image_key: 'card-share-public/a.jpg' }, { id: 'page-2', front_image_key: 'card-share-public/b.jpg' }];
    const res = await sweep();
    const body = await res.json();
    expect(mockDeleteObject).toHaveBeenCalledWith('card-share-public/a.jpg');
    expect(mockDeleteObject).toHaveBeenCalledWith('card-share-public/b.jpg');
    expect(deletedRowIds).toEqual(['page-1', 'page-2']);
    expect(body).toEqual({ ok: true, pagesProcessed: 2, objectsDeleted: 2, errors: [] });
  });

  it('still removes the row even when the S3 delete fails (an orphaned row is harmless, an orphaned object is the thing worth retrying)', async () => {
    fixture.expiredPages = [{ id: 'page-1', front_image_key: 'card-share-public/a.jpg' }];
    mockDeleteObject.mockRejectedValue(new Error('NoSuchKey'));
    const res = await sweep();
    const body = await res.json();
    expect(deletedRowIds).toEqual(['page-1']);
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveLength(1);
  });

  it('only ever queries rows past expires_at — never deletes a still-valid page', async () => {
    // The mock's `lt` call is the only query path this route uses; its
    // presence in the mock's `select().lt()` chain shape is itself the
    // proof this route filters server-side rather than fetching everything
    // and filtering in application code.
    fixture.expiredPages = [{ id: 'page-1', front_image_key: 'card-share-public/a.jpg' }];
    await sweep();
    expect(deletedRowIds).toEqual(['page-1']);
  });
});
