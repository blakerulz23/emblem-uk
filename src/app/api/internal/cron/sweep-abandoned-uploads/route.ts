import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteObject, isS3NotFoundError } from '@/lib/s3-client';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Automatic 7-day deletion of abandoned/incomplete anonymous uploads
 * (founder retention schedule: "Abandoned/incomplete uploads: 7 days,
 * trigger = upload started, order never finalised"). Covers both
 * reservation systems that let an upload happen before a real order/claim
 * exists — builder_submission_capabilities (ordinary builder) and
 * squad_invite_participations still in 'started' with no commitment
 * (Squad Invite). Never touches a row whose reservation genuinely became
 * a real order (`state = 'submitted'` / participation `status <>
 * 'started'`) — those objects are the ordinary 90-day artwork/PDF
 * retention's concern, not this sweep's.
 *
 * Protected by a shared secret rather than requireStaff()/RLS — this is
 * an unauthenticated machine-to-machine endpoint (Vercel Cron), never a
 * browser call, matching the CRON_SECRET convention Vercel itself
 * documents for cron routes.
 *
 * Each asset's tracking row is removed only once every S3 object it names
 * is confirmed gone (deleted, or conclusively already absent) — never
 * unconditionally. A transient S3 failure (permission, timeout, network,
 * or any other error that isn't a conclusive "not found") leaves the row
 * in place so the next sweep retries the same asset; deleting the row
 * regardless of outcome would orphan the object with no record left to
 * retry against. Matches the success-gated ordering already used by
 * sweep-expired-artwork/route.ts.
 */
const ABANDONMENT_WINDOW_DAYS = 7;

type AssetRow = { slot_key: string; reservation_id: string | null };
type AssetOutcome = 'deleted' | 'already_absent' | 'retry_s3' | 'retry_db';

async function eraseOneObject(key: string): Promise<{ ok: true; alreadyAbsent: boolean } | { ok: false }> {
  try {
    await deleteObject(key);
    return { ok: true, alreadyAbsent: false };
  } catch (err) {
    if (isS3NotFoundError(err)) {
      return { ok: true, alreadyAbsent: true };
    }
    return { ok: false };
  }
}

/**
 * Erases every S3 object an asset row names (its stable key, plus a
 * reservation-scoped pending key if one was ever issued), then removes the
 * tracking row only if every one of those deletes is confirmed gone. The
 * row is left untouched on any S3 failure or on a failed row delete, so a
 * later sweep run naturally retries — re-deleting an already-gone key is a
 * safe no-op (deleteObject's own idempotency).
 */
async function sweepAsset(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  table: 'builder_submission_assets' | 'squad_invite_participation_assets',
  idColumn: 'submission_id' | 'participation_id',
  idValue: string,
  asset: AssetRow
): Promise<AssetOutcome> {
  const key = `order-assets/${idValue}/${asset.slot_key}`;
  const keys = asset.reservation_id ? [key, `${key}.pending-${asset.reservation_id}`] : [key];

  let alreadyAbsent = false;
  for (const objectKey of keys) {
    const outcome = await eraseOneObject(objectKey);
    if (!outcome.ok) {
      return 'retry_s3';
    }
    if (outcome.alreadyAbsent) {
      alreadyAbsent = true;
    }
  }

  const { error } = await serviceRole.from(table).delete().eq(idColumn, idValue).eq('slot_key', asset.slot_key);
  if (error) {
    return 'retry_db';
  }

  return alreadyAbsent ? 'already_absent' : 'deleted';
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceRole = createServiceRoleClient();
  const cutoff = new Date(Date.now() - ABANDONMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = {
    builderSubmissions: 0,
    squadInviteParticipations: 0,
    deleted: 0,
    alreadyAbsent: 0,
    retryable: 0,
    // Reason codes only — never a raw storage key, slot identifier, or
    // any other child-identifying detail.
    errors: [] as string[],
  };

  const recordOutcome = (outcome: AssetOutcome, context: 'builder' | 'squad-invite') => {
    if (outcome === 'deleted') {
      results.deleted += 1;
    } else if (outcome === 'already_absent') {
      results.alreadyAbsent += 1;
    } else {
      results.retryable += 1;
      results.errors.push(
        outcome === 'retry_s3'
          ? `${context}: storage delete failed, will retry next sweep`
          : `${context}: tracking cleanup failed, will retry next sweep`
      );
    }
  };

  // Ordinary builder: capabilities past the abandonment window that never
  // reached 'submitted'.
  const { data: capabilities } = await serviceRole
    .from('builder_submission_capabilities')
    .select('id, state')
    .neq('state', 'submitted')
    .lt('created_at', cutoff);

  for (const cap of capabilities ?? []) {
    const { data: assets } = await serviceRole.from('builder_submission_assets').select('slot_key, reservation_id').eq('submission_id', cap.id);
    for (const asset of assets ?? []) {
      const outcome = await sweepAsset(serviceRole, 'builder_submission_assets', 'submission_id', cap.id, asset);
      recordOutcome(outcome, 'builder');
    }
    results.builderSubmissions += 1;
  }

  // Squad Invite: participations still 'started' (never committed) past
  // the abandonment window.
  const { data: participations } = await serviceRole
    .from('squad_invite_participations')
    .select('id')
    .eq('status', 'started')
    .lt('created_at', cutoff);

  for (const p of participations ?? []) {
    const { data: assets } = await serviceRole.from('squad_invite_participation_assets').select('slot_key, reservation_id').eq('participation_id', p.id);
    for (const asset of assets ?? []) {
      const outcome = await sweepAsset(serviceRole, 'squad_invite_participation_assets', 'participation_id', p.id, asset);
      recordOutcome(outcome, 'squad-invite');
    }
    results.squadInviteParticipations += 1;
  }

  if (results.retryable > 0) {
    await enqueueAndDispatchStaffNotification(serviceRole, {
      eventType: 'upload_sweep_errors',
      eventKey: `upload_sweep_errors:${new Date().toISOString().slice(0, 10)}`,
      subjectId: null,
      recipientScope: 'all_staff',
      summary: { retryable: results.retryable, deleted: results.deleted, alreadyAbsent: results.alreadyAbsent },
      linkPath: '/staff/queue',
    });
  }

  return NextResponse.json({ ok: results.retryable === 0, ...results });
}
