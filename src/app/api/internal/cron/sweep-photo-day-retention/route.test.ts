import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const DAY = '0b6c4d2e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const PREFIX = `photo-day/${DAY}/`;
const KEY_A = `${PREFIX}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const KEY_B = `${PREFIX}bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
const STRAY = `${PREFIX}cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;

const calls: string[] = [];
const mockDelete = vi.fn();
const mockList = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  deleteObject: (key: string) => { calls.push(`s3.delete ${key}`); return mockDelete(key); },
  listObjectKeys: (prefix: string) => { calls.push(`s3.list ${prefix}`); return mockList(prefix); },
}));

let dueDays: unknown[];
let photoRows: { id: string; storage_key: string }[];
const rpcResults: Record<string, (args: Record<string, unknown>) => unknown> = {};
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc ${name} ${JSON.stringify(args)}`);
      if (name === 'list_photo_days_due_for_deletion') return { data: dueDays, error: null };
      return { data: rpcResults[name]?.(args) ?? null, error: null };
    },
    from: () => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) c[m] = () => c;
      c.limit = async () => ({ data: photoRows, error: null });
      return c;
    },
  }),
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const run = (method: 'GET' | 'POST' = 'GET', auth = 'Bearer test-secret') =>
  (method === 'GET' ? GET : POST)(new NextRequest('http://localhost/api/internal/cron/sweep-photo-day-retention', { method, headers: { authorization: auth } }));

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  calls.length = 0;
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockList.mockReset().mockResolvedValue([STRAY]);
  dueDays = [{ photo_day_id: DAY }];
  photoRows = [{ id: 'photo-a', storage_key: KEY_A }, { id: 'photo-b', storage_key: KEY_B }];
  rpcResults.mark_photo_day_photo_storage_deleted = () => true;
  rpcResults.close_photo_day_after_deletion = () => ({ ok: true, photosDeleted: 2 });
});

describe('Photo Day retention sweep', () => {
  it('refuses without the cron secret, and when no secret is configured', async () => {
    expect((await run('GET', 'Bearer wrong')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await run('GET', 'Bearer ')).status).toBe(401);
    expect(calls).toEqual([]);
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('runs on GET (how Vercel Cron calls) and on POST', async () => {
    expect((await run('GET')).status).toBe(200);
    expect((await run('POST')).status).toBe(200);
  });

  it('deletes each object before marking its row, empties the prefix, then closes the day', async () => {
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: true, daysClosed: 1, photosDeleted: 2, strayObjectsDeleted: 1, daysDeferred: 0 });
    const order = calls.filter((c) => !c.startsWith('rpc list_'));
    expect(order).toEqual([
      `s3.delete ${KEY_A}`, 'rpc mark_photo_day_photo_storage_deleted {"p_photo_id":"photo-a"}',
      `s3.delete ${KEY_B}`, 'rpc mark_photo_day_photo_storage_deleted {"p_photo_id":"photo-b"}',
      `s3.list ${PREFIX}`, `s3.delete ${STRAY}`,
      `rpc close_photo_day_after_deletion {"p_photo_day_id":"${DAY}"}`,
    ]);
  });

  it('a failed storage delete leaves the row unmarked and the day open for the next run', async () => {
    mockDelete.mockImplementation(async (key: string) => { if (key === KEY_B) throw new Error('S3 down'); });
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: false, photosDeleted: 1, daysClosed: 0, daysDeferred: 1 });
    expect(calls).not.toContain('rpc mark_photo_day_photo_storage_deleted {"p_photo_id":"photo-b"}');
    expect(calls.some((c) => c.startsWith('rpc close_'))).toBe(false);
    expect(calls.some((c) => c.startsWith('s3.list'))).toBe(false);
  });

  it('never deletes a key outside the day’s prefix', async () => {
    photoRows = [{ id: 'photo-x', storage_key: 'order-assets/someone-else/child:photo' }];
    const body = await (await run()).json();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(body).toMatchObject({ ok: false, daysClosed: 0 });
  });

  it('does not close the day if the prefix could not be emptied', async () => {
    mockList.mockRejectedValue(new Error('S3 list failed'));
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: false, daysClosed: 0, daysDeferred: 1 });
    expect(calls.some((c) => c.startsWith('rpc close_'))).toBe(false);
  });

  it('does not close the day if a row could not be marked (the database said not due)', async () => {
    rpcResults.mark_photo_day_photo_storage_deleted = () => false;
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: false, daysClosed: 0 });
    expect(calls.some((c) => c.startsWith('rpc close_'))).toBe(false);
  });

  it('defers a day with more rows than one run handles', async () => {
    photoRows = Array.from({ length: 500 }, (_, i) => ({ id: `p-${i}`, storage_key: `${PREFIX}${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.jpg` }));
    const body = await (await run()).json();
    expect(body).toMatchObject({ photosDeleted: 500, daysClosed: 0, daysDeferred: 1 });
  });

  it('reports a database refusal to close without failing the whole run', async () => {
    rpcResults.close_photo_day_after_deletion = () => ({ ok: false, reason: 'photos_remaining' });
    const body = await (await run()).json();
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toContain('photos_remaining');
  });
});
