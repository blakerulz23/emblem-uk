import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { OrganiserRole } from '@/lib/squad-invite';

const roles = new Set<OrganiserRole>(['coach_or_club_representative','team_manager','parent_representative','emblem_staff']);

export async function POST(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const role = body?.organiserRole as OrganiserRole;
  const deadline = new Date(String(body?.deadlineAt ?? ''));
  if (!body || !roles.has(role) || !String(body.clubTeamName ?? '').trim() || !String(body.footballAgeGroup ?? '').trim()
    || !Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
    return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 });
  }
  if (body.authorityAccepted !== true || body.deliveryAccepted !== true) {
    return NextResponse.json({ error: 'Required declarations must be accepted' }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.from('squad_invites').insert({
    organiser_profile_id: user.id,
    organiser_role: role,
    club_team_name: String(body.clubTeamName).trim(),
    football_age_group: String(body.footballAgeGroup).trim(),
    expected_squad_size: typeof body.expectedSquadSize === 'number' ? body.expectedSquadSize : null,
    deadline_at: deadline.toISOString(),
    authority_declaration_version: 'squad_invite_organiser_authority_v1',
    terms_version: 'squad_invite_terms_v1',
    privacy_version: 'squad_invite_privacy_v1',
    delivery_recipient_name: String(body.deliveryRecipientName ?? '').trim(),
    delivery_recipient_role: String(body.deliveryRecipientRole ?? '').trim(),
    delivery_address: String(body.deliveryAddress ?? '').trim(),
    delivery_postcode: String(body.deliveryPostcode ?? '').trim().toUpperCase(),
    delivery_contact: String(body.deliveryContact ?? '').trim(),
    delivery_instructions: String(body.deliveryInstructions ?? '').trim() || null,
    recipient_distribution_accepted_at: new Date().toISOString(),
  }).select('id,public_id,campaign_status').single();

  if (error || !data) return NextResponse.json({ error: 'Could not create Squad Invite' }, { status: 500 });
  await service.from('squad_invite_permissions').insert({
    campaign_id: data.id, actor_profile_id: user.id, purpose: 'organiser_authority',
    policy_version: 'squad_invite_organiser_authority_v1', granted: true,
  });
  await service.from('squad_invite_audit_events').insert({
    campaign_id: data.id, actor_profile_id: user.id, actor_role: 'organiser', event_type: 'campaign_created',
  });
  return NextResponse.json({ ok: true, campaign: data }, { status: 201 });
}
