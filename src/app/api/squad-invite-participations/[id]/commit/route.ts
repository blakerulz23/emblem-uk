import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { effectiveCampaignStatus, hashBuilderToken, mayCompleteExistingBuilder } from '@/lib/squad-invite';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';

const REQUIRED = [
  ['child_information_authority','squad_invite_child_authority_v1'],
  ['photograph_manufacture','squad_invite_photo_manufacture_v1'],
  ['consolidated_delivery','squad_invite_team_delivery_v1'],
  ['payment_neutral_commitment','squad_invite_commitment_v1'],
] as const;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Commitment unavailable' }, { status: 403 });
  const token = cookies().get('emblem_squad_builder')?.value;
  const { data: { user } } = await createClient().auth.getUser();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!token || !body) return NextResponse.json({ error: 'Builder credential and commitment are required' }, { status: 400 });
  if (body.fullDateOfBirth || body.school || body.childAddress || body.preciseLocation || body.publicProfile === true) {
    return NextResponse.json({ error: 'Disallowed child fields' }, { status: 400 });
  }
  const accepted = body.accepted as Record<string, unknown> | undefined;
  if (!accepted || REQUIRED.some(([purpose]) => accepted[purpose] !== true)) {
    return NextResponse.json({ error: 'All required acknowledgements must be accepted separately' }, { status: 400 });
  }
  const service = createServiceRoleClient();
  const { data: participation } = await service.from('squad_invite_participations')
    .select('id,campaign_id,status,squad_invites!inner(campaign_status,deadline_at)')
    .eq('id', params.id).eq('guardian_profile_id', user.id).eq('builder_token_hash', hashBuilderToken(token)).maybeSingle();
  if (!participation || participation.status !== 'started') return NextResponse.json({ error: 'Commitment unavailable' }, { status: 404 });
  const campaignRaw = participation.squad_invites as unknown;
  const campaign = (Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw) as { campaign_status: Parameters<typeof effectiveCampaignStatus>[0]; deadline_at: string };
  if (!mayCompleteExistingBuilder(effectiveCampaignStatus(campaign.campaign_status, campaign.deadline_at))) {
    return NextResponse.json({ error: 'Completion window has ended' }, { status: 409 });
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await service.from('squad_invite_participations').update({
    status: 'commitment_completed', commitment_completed_at: now,
    display_first_name: String(body.playerFirstName ?? '').trim(),
    display_surname_initial: String(body.playerSurnameInitial ?? '').trim().toUpperCase(),
    squad_number: typeof body.squadNumber === 'number' ? body.squadNumber : null,
    print_quantity: typeof body.printQuantity === 'number' ? body.printQuantity : 1,
  }).eq('id', participation.id).eq('status', 'started').select('id').maybeSingle();
  if (error || !updated) return NextResponse.json({ error: 'Could not record commitment' }, { status: 409 });
  await service.from('squad_invite_permissions').insert(REQUIRED.map(([purpose, policy_version]) => ({
    campaign_id: participation.campaign_id, participation_id: participation.id, purpose, policy_version, granted: true,
  })));
  await service.from('squad_invite_audit_events').insert({
    campaign_id: participation.campaign_id, participation_id: participation.id, actor_role: 'parent', event_type: 'commitment_completed',
  });
  return NextResponse.json({ ok: true, status: 'commitment_completed', paymentTaken: false });
}
