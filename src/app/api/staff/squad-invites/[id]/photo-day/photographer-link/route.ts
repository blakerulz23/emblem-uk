import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import {
  createPhotographerToken, isUuid, parseLinkHours, photoDayReasonMessage, photographerUploadUrl, readRpcOutcome,
} from '@/lib/photo-day';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Issues or revokes the photographer's upload link (migration 0105).
 *
 * Issue: a fresh 32-byte token. Only its SHA-256 goes to the database. The
 * full link is returned in this one response and is never shown again;
 * issuing again replaces it and the old link stops working at once.
 * Revoke: the link stops working at once.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown; validHours?: unknown } | null;
  const action = body?.action === 'issue' || body?.action === 'revoke' ? body.action : null;
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const service = createServiceRoleClient();
  const { data: day } = await service.from('squad_invite_photo_days').select('id').eq('campaign_id', params.id).maybeSingle();
  if (!day) return NextResponse.json({ error: photoDayReasonMessage('photo_day_not_found') }, { status: 404 });

  if (action === 'revoke') {
    const { data, error } = await service.rpc('revoke_photo_day_photographer_link', {
      p_photo_day_id: day.id, p_staff_profile_id: staff.userId,
    });
    if (error) return NextResponse.json({ error: 'The link could not be revoked' }, { status: 500 });
    const outcome = readRpcOutcome(data);
    if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const validHours = parseLinkHours(body?.validHours);
  if (!validHours) return NextResponse.json({ error: photoDayReasonMessage('invalid_validity') }, { status: 400 });
  const credential = createPhotographerToken();
  const { data, error } = await service.rpc('issue_photo_day_photographer_link', {
    p_photo_day_id: day.id, p_staff_profile_id: staff.userId, p_token_hash: credential.hash, p_valid_hours: validHours,
  });
  if (error) return NextResponse.json({ error: 'The link could not be issued' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json(
    { ok: true, uploadUrl: photographerUploadUrl(request.nextUrl.origin, day.id, credential.token), expiresAt: outcome.value.expiresAt },
    { headers: NO_STORE },
  );
}
