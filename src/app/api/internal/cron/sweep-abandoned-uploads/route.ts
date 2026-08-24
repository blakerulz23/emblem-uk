import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteObject } from '@/lib/s3-client';

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
 */
const ABANDONMENT_WINDOW_DAYS = 7;

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceRole = createServiceRoleClient();
  const cutoff = new Date(Date.now() - ABANDONMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = { builderSubmissions: 0, squadInviteParticipations: 0, objectsDeleted: 0, errors: [] as string[] };

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
      const key = `order-assets/${cap.id}/${asset.slot_key}`;
      try {
        await deleteObject(key);
        if (asset.reservation_id) await deleteObject(`${key}.pending-${asset.reservation_id}`);
        results.objectsDeleted += 1;
      } catch (err) {
        results.errors.push(`builder ${cap.id}/${asset.slot_key}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }
    await serviceRole.from('builder_submission_assets').delete().eq('submission_id', cap.id);
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
      const key = `order-assets/${p.id}/${asset.slot_key}`;
      try {
        await deleteObject(key);
        if (asset.reservation_id) await deleteObject(`${key}.pending-${asset.reservation_id}`);
        results.objectsDeleted += 1;
      } catch (err) {
        results.errors.push(`squad-invite ${p.id}/${asset.slot_key}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }
    await serviceRole.from('squad_invite_participation_assets').delete().eq('participation_id', p.id);
    results.squadInviteParticipations += 1;
  }

  return NextResponse.json({ ok: results.errors.length === 0, ...results });
}
