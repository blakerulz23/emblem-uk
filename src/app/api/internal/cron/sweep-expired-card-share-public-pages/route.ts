import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Data minimisation for the founder-approved public share page (migration
 * 0085): get_card_share_public_page already stops resolving an expired
 * page immediately (expires_at is re-checked on every read, never trusted
 * from a cached result), so this sweep is not what keeps an expired page
 * from being viewable — it's what actually deletes the stored image and
 * its row once the 7-day window has genuinely passed, rather than leaving
 * an unreachable-but-still-present copy sitting in S3 indefinitely.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceRole = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const results = { pagesProcessed: 0, objectsDeleted: 0, errors: [] as string[] };

  const { data: pages } = await serviceRole
    .from('card_share_public_pages')
    .select('id, front_image_key')
    .lt('expires_at', nowIso);

  for (const page of pages ?? []) {
    try {
      await deleteObject(page.front_image_key);
      results.objectsDeleted += 1;
    } catch (err) {
      results.errors.push(`page ${page.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
      // Still remove the row below even if the S3 delete failed (e.g. the
      // object was already gone) — an orphaned row with no reachable page
      // is harmless, an orphaned S3 object is the thing worth retrying,
      // and this sweep runs daily regardless.
    }
    await serviceRole.from('card_share_public_pages').delete().eq('id', page.id);
    results.pagesProcessed += 1;
  }

  return NextResponse.json({ ok: results.errors.length === 0, ...results });
}
