import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';

// Lets the organiser flag a name shown on their own Squad progress
// dashboard as one they don't recognise — the club-mediated check behind
// the bounded first-name + surname-initial list (see CampaignDashboard.tsx
// and the dashboard route's own comment). Writes into the existing
// append-only audit log, never a new record type staff would need a
// separate surface to see; it shows up in their existing "Audit history"
// section on the detail page. Never sends email, never mutates the
// participation itself — purely a signal for staff to review.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Unavailable' }, { status: 403 });
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!(await consumeSquadInviteRateLimit(request.headers, 'concern-flag', user.id))) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as { note?: unknown } | null;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (note.length < 3) return NextResponse.json({ error: 'A short description is required' }, { status: 400 });
  const service = createServiceRoleClient();
  const { data: campaign } = await service.from('squad_invites')
    .select('id').eq('id', params.id).eq('organiser_profile_id', user.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Unavailable' }, { status: 404 });
  const { data: matchedRequest } = await service.from('squad_invite_requests')
    .select('id').eq('campaign_id', campaign.id).maybeSingle();
  if (!matchedRequest) return NextResponse.json({ error: 'Unavailable' }, { status: 404 });
  const { error } = await service.from('squad_invite_request_audit_events').insert({
    request_id: matchedRequest.id, actor_profile_id: user.id, actor_role: 'organiser',
    event_type: 'organiser_flagged_concern', metadata: { note },
  });
  if (error) {
    // Fixed route label + a safe category only — never the note text
    // itself, never the raw Postgres error message.
    console.error('squad-invites/flag-concern:insert', error.code ?? 'unknown');
    return NextResponse.json({ error: 'Unavailable' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
