import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ProductionBuilder from '@/components/emblem-uk/ProductionBuilder';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * JoinSquadInvite.start() sends a successful parent here via
 * router.push(`/builder?squadParticipation=${id}`) — searchParams is a
 * standard Next.js Page prop, read server-side. Ownership is re-verified
 * here (guardian_profile_id must match the signed-in session) before the
 * builder ever renders — a guessed or stale participation id, or a session
 * that doesn't own it, gets a 404, never a peek at someone else's card.
 */
async function resolveSquadInviteContext(participationId: string) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return null;
  const { data } = await createServiceRoleClient()
    .from('squad_invite_participations')
    .select('id, status, squad_invites!inner(club_team_name)')
    .eq('id', participationId)
    .eq('guardian_profile_id', user.id)
    .maybeSingle();
  if (!data || data.status !== 'started') return null;
  const campaignRaw = data.squad_invites as unknown;
  const campaign = (Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw) as { club_team_name: string } | undefined;
  return { participationId: data.id as string, campaignClubName: campaign?.club_team_name ?? '' };
}

export default async function BuilderPage({ searchParams }: { searchParams: { squadParticipation?: string } }) {
  if (searchParams.squadParticipation) {
    const context = await resolveSquadInviteContext(searchParams.squadParticipation);
    if (!context) notFound();
    return <ProductionBuilder squadInviteContext={context} />;
  }
  return (
    <Suspense fallback={null}>
      <ProductionBuilder squadInviteEnabled={isSquadInviteMvpEnabled()} />
    </Suspense>
  );
}
