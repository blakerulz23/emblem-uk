import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteObject, listObjectKeys } from '@/lib/s3-client';
import { isUuid } from '@/lib/photo-day';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Photo Day retention (migration 0107; Blake's decision, 15 Nov 2026):
 * every photo, matched or not, is deleted 30 days after the campaign
 * closes and never later than 60 days after the shoot. The database
 * decides what is due (list_photo_days_due_for_deletion); this route does
 * the S3 deletes, in an order that can only ever fail safe:
 *
 *   1. each photo row's object is deleted, THEN the row is marked deleted
 *      (a failed delete leaves the row for tomorrow's run);
 *   2. the day's whole `photo-day/{dayId}/` prefix is listed and emptied,
 *      which also removes objects that never got a row (an upload the
 *      database refused whose clean-up delete also failed);
 *   3. only if both steps fully succeeded is the day closed.
 *
 * Accepts GET because Vercel Cron calls with GET (sending
 * `Authorization: Bearer $CRON_SECRET`); POST kept for manual runs.
 * Never deletes outside `photo-day/{uuid}/`. Reports ids and counts only.
 */
const DAYS_PER_RUN = 20;
const ROWS_PER_DAY = 500;
const TIME_BUDGET_MS = 45_000;

type Result = { daysClosed: number; photosDeleted: number; strayObjectsDeleted: number; daysDeferred: number; errors: string[] };

async function sweep(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const service = createServiceRoleClient();
  const result: Result = { daysClosed: 0, photosDeleted: 0, strayObjectsDeleted: 0, daysDeferred: 0, errors: [] };

  const { data: due, error: dueError } = await service.rpc('list_photo_days_due_for_deletion', { p_limit: DAYS_PER_RUN });
  if (dueError) return NextResponse.json({ ok: false, error: 'Could not list due photo days' }, { status: 500 });

  for (const day of (due ?? []) as { photo_day_id: string }[]) {
    if (Date.now() - started > TIME_BUDGET_MS) { result.daysDeferred += 1; continue; }
    const dayId = day.photo_day_id;
    if (!isUuid(dayId)) { result.errors.push('invalid photo day id from database'); continue; }
    const prefix = `photo-day/${dayId}/`;
    let complete = true;

    // 1. Rows first.
    const { data: photos, error: photosError } = await service.from('squad_invite_photo_day_photos')
      .select('id,storage_key').eq('photo_day_id', dayId).is('deleted_at', null).limit(ROWS_PER_DAY);
    if (photosError) { result.errors.push(`day ${dayId}: could not read photos`); continue; }
    const rows = (photos ?? []) as { id: string; storage_key: string }[];
    if (rows.length === ROWS_PER_DAY) complete = false; // more remain; finish next run
    for (const photo of rows) {
      if (Date.now() - started > TIME_BUDGET_MS) { complete = false; break; }
      if (!photo.storage_key.startsWith(prefix)) {
        result.errors.push(`day ${dayId}: photo ${photo.id} key outside its prefix, skipped`);
        complete = false;
        continue;
      }
      try {
        await deleteObject(photo.storage_key);
        const { data: marked, error: markError } = await service.rpc('mark_photo_day_photo_storage_deleted', { p_photo_id: photo.id });
        if (markError || marked !== true) {
          result.errors.push(`day ${dayId}: photo ${photo.id} deleted from storage but not marked`);
          complete = false;
          continue;
        }
        result.photosDeleted += 1;
      } catch {
        result.errors.push(`day ${dayId}: photo ${photo.id} storage delete failed`);
        complete = false;
      }
    }
    if (!complete) { result.daysDeferred += 1; continue; }

    // 2. Everything left under the prefix (objects with no row).
    try {
      for (const key of await listObjectKeys(prefix)) {
        if (!key.startsWith(prefix)) continue;
        await deleteObject(key);
        result.strayObjectsDeleted += 1;
      }
    } catch {
      result.errors.push(`day ${dayId}: could not empty storage prefix`);
      result.daysDeferred += 1;
      continue;
    }

    // 3. Close.
    const { data: closed, error: closeError } = await service.rpc('close_photo_day_after_deletion', { p_photo_day_id: dayId });
    if (closeError || !(closed as { ok?: boolean } | null)?.ok) {
      result.errors.push(`day ${dayId}: could not close (${(closed as { reason?: string } | null)?.reason ?? 'error'})`);
      continue;
    }
    result.daysClosed += 1;
  }

  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}

export async function GET(request: NextRequest) {
  return sweep(request);
}

export async function POST(request: NextRequest) {
  return sweep(request);
}
