import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

/**
 * Locks a submitted coach card for production, or sends it back to the
 * organiser with a reason (review_squad_invite_coach_card, migration 0059)
 * — same lock/request-changes shape as review_squad_invite_request, rather
 * than a one-way approval. Gated on Approver, matching every other route
 * with real production/financial weight (approve, cancel-approval,
 * finalise-pricing) — not the reviewer-level permission the main request
 * review actions use.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const body = await request.json().catch(() => null) as { action?: unknown; reason?: unknown } | null;
  const action = body?.action === 'lock' || body?.action === 'request_changes' ? body.action : null;
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null;
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('review_squad_invite_coach_card', {
    p_campaign_id: params.id, p_action: action, p_staff_profile_id: staff.userId, p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message || 'The coach card could not be reviewed' }, { status: 409 });
  return NextResponse.json({ ok: true, result: data });
}
