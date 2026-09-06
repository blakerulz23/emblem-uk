import { readFileSync } from 'fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { FULL_PX } from './print-master-geometry';

const mockUploadObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockGetObjectBytes = vi.fn();
vi.mock('./s3-client', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  getObjectBytes: (...args: unknown[]) => mockGetObjectBytes(...args),
}));

// Minimal chainable query-builder mock covering exactly the call shapes
// print-master-storage.ts uses: .from(t).select('*').eq(...).eq(...).eq(...).eq(...).limit(n)
// and .from(t).insert({...}).select('*').single().
type QueryResult = { data: unknown; error: { message: string } | null };
let selectQueue: QueryResult[] = [];
let insertQueue: QueryResult[] = [];
const insertedRows: Record<string, unknown>[] = [];

interface SelectChain {
  eq: () => SelectChain;
  limit: () => Promise<QueryResult>;
}

function makeSelectChain(): SelectChain {
  const chain: SelectChain = {
    eq: () => chain,
    limit: async () => selectQueue.shift() ?? { data: [], error: null },
  };
  return chain;
}

const mockServiceClient = {
  from: () => ({
    select: () => makeSelectChain(),
    insert: (row: Record<string, unknown>) => {
      insertedRows.push(row);
      return {
        select: () => ({
          single: async () => insertQueue.shift() ?? { data: null, error: { message: 'no queued insert result' } },
        }),
      };
    },
  }),
};
vi.mock('./supabase/server', () => ({ createServiceRoleClient: () => mockServiceClient }));

import { persistConfirmedPrintMasters, isValidPrintMasterKey, fetchVerifiedPrintMaster } from './print-master-storage';
import { sha256Hex } from './print-master-validation';

async function validMaster(): Promise<Buffer> {
  return sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 5, g: 5, b: 5, alpha: 1 } } }).png().toBuffer();
}

const SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SUBMISSION_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ID = 'player-1';

beforeEach(() => {
  mockUploadObject.mockReset().mockResolvedValue(undefined);
  mockDeleteObject.mockReset().mockResolvedValue(undefined);
  mockGetObjectBytes.mockReset();
  selectQueue = [];
  insertQueue = [];
  insertedRows.length = 0;
});

describe('print-master-storage — namespaced keys', () => {
  it('accepts a correctly-namespaced, correctly-suffixed key for its own submission', () => {
    const key = `print-masters/${SUBMISSION_ID}/card/abc-front.png`;
    expect(isValidPrintMasterKey(key, SUBMISSION_ID, 'front')).toBe(true);
  });

  it('rejects a key belonging to a different submission — no client authority to substitute another order\'s master', () => {
    const foreignKey = `print-masters/${OTHER_SUBMISSION_ID}/card/abc-front.png`;
    expect(isValidPrintMasterKey(foreignKey, SUBMISSION_ID, 'front')).toBe(false);
  });

  it('rejects a front key presented as a back key and vice versa — front/back cannot be swapped', () => {
    const frontKey = `print-masters/${SUBMISSION_ID}/card/abc-front.png`;
    expect(isValidPrintMasterKey(frontKey, SUBMISSION_ID, 'back')).toBe(false);
  });

  it('rejects a key from the temporary card-share-public namespace entirely — never reuse that path', () => {
    const shareKey = `card-share-public/abc.jpg`;
    expect(isValidPrintMasterKey(shareKey, SUBMISSION_ID, 'front')).toBe(false);
  });
});

describe('print-master-storage — persistConfirmedPrintMasters', () => {
  it('uploads both sides and inserts a confirmed row on first call', async () => {
    selectQueue.push({ data: [], error: null }); // no existing confirmed row
    const front = await validMaster();
    const back = await validMaster();
    insertQueue.push({
      data: {
        id: 'row-1', submission_id: SUBMISSION_ID, order_id: null, player_id: PLAYER_ID, product: 'card',
        front_key: 'print-masters/x/card/u-front.png', back_key: 'print-masters/x/card/u-back.png',
        width_px: FULL_PX.w, height_px: FULL_PX.h, mime_type: 'image/png',
        front_sha256: sha256Hex(front), back_sha256: sha256Hex(back), render_version: 'v1', status: 'confirmed', created_at: 'now',
      },
      error: null,
    });

    const row = await persistConfirmedPrintMasters({ submissionId: SUBMISSION_ID, playerId: PLAYER_ID, front, back });
    expect(mockUploadObject).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('confirmed');
  });

  it('is idempotent: a retry that already has a confirmed row returns it without uploading or inserting again', async () => {
    const existing = { id: 'row-existing', status: 'confirmed', front_key: 'x', back_key: 'y' };
    selectQueue.push({ data: [existing], error: null });

    const row = await persistConfirmedPrintMasters({ submissionId: SUBMISSION_ID, playerId: PLAYER_ID, front: await validMaster(), back: await validMaster() });
    expect(row).toEqual(existing);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('cleans up the front object if the back upload fails — never leaves a lone orphaned side', async () => {
    selectQueue.push({ data: [], error: null });
    mockUploadObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('S3 down'));

    await expect(
      persistConfirmedPrintMasters({ submissionId: SUBMISSION_ID, playerId: PLAYER_ID, front: await validMaster(), back: await validMaster() })
    ).rejects.toThrow('S3 down');
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it('cleans up BOTH uploaded objects if the database insert fails, using only the two exact keys just written (never a broad delete)', async () => {
    selectQueue.push({ data: [], error: null }); // no existing row
    insertQueue.push({ data: null, error: { message: 'db down' } });
    selectQueue.push({ data: [], error: null }); // race re-check also finds nothing

    await expect(
      persistConfirmedPrintMasters({ submissionId: SUBMISSION_ID, playerId: PLAYER_ID, front: await validMaster(), back: await validMaster() })
    ).rejects.toThrow(/insert failed/);
    expect(mockDeleteObject).toHaveBeenCalledTimes(2);
  });

  it('a concurrent-insert race (unique-violation) resolves to the winning row rather than surfacing a spurious failure', async () => {
    selectQueue.push({ data: [], error: null }); // no existing row at first check
    insertQueue.push({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
    const winnerRow = { id: 'winner', status: 'confirmed', front_key: 'a', back_key: 'b' };
    selectQueue.push({ data: [winnerRow], error: null }); // race re-check finds the winner

    const row = await persistConfirmedPrintMasters({ submissionId: SUBMISSION_ID, playerId: PLAYER_ID, front: await validMaster(), back: await validMaster() });
    expect(row).toEqual(winnerRow);
    // Cleanup still runs for the objects THIS call uploaded before losing the race.
    expect(mockDeleteObject).toHaveBeenCalledTimes(2);
  });
});

describe('print-master-storage — fetchVerifiedPrintMaster', () => {
  it('rejects a row whose key is outside its own submission namespace before ever calling S3', async () => {
    const row = {
      id: 'r', submission_id: SUBMISSION_ID, order_id: null, player_id: PLAYER_ID, product: 'card',
      front_key: `print-masters/${OTHER_SUBMISSION_ID}/card/x-front.png`, back_key: `print-masters/${SUBMISSION_ID}/card/x-back.png`,
      width_px: FULL_PX.w, height_px: FULL_PX.h, mime_type: 'image/png', front_sha256: 'a'.repeat(64), back_sha256: 'b'.repeat(64),
      render_version: 'v1', status: 'confirmed' as const, created_at: 'now',
    };
    await expect(fetchVerifiedPrintMaster(row, 'front')).rejects.toThrow(/namespace/i);
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it('rejects when the fetched bytes do not match the recorded digest', async () => {
    const bytes = await validMaster();
    const row = {
      id: 'r', submission_id: SUBMISSION_ID, order_id: null, player_id: PLAYER_ID, product: 'card',
      front_key: `print-masters/${SUBMISSION_ID}/card/x-front.png`, back_key: `print-masters/${SUBMISSION_ID}/card/x-back.png`,
      width_px: FULL_PX.w, height_px: FULL_PX.h, mime_type: 'image/png', front_sha256: 'f'.repeat(64), back_sha256: 'f'.repeat(64),
      render_version: 'v1', status: 'confirmed' as const, created_at: 'now',
    };
    mockGetObjectBytes.mockResolvedValue({ bytes, contentType: 'image/png' });
    await expect(fetchVerifiedPrintMaster(row, 'front')).rejects.toThrow(/digest/i);
  });
});

describe('print-master-storage — never exposed through public share routes', () => {
  it('the card-share public-page route never imports or references print-master storage', () => {
    const routeSource = readFileSync('src/app/api/card-share/public-page/route.ts', 'utf8');
    expect(routeSource).not.toMatch(/print-master/);
  });
  it('the card-share-public-page resolver never references the print-masters namespace or table', () => {
    const source = readFileSync('src/lib/card-share-public-page.ts', 'utf8');
    expect(source).not.toMatch(/print-master/);
  });
});
