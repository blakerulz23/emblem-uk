import { notFound } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import OrganiserStart from './OrganiserStart';

export const dynamic='force-dynamic';

// A returning organiser with a valid Supabase Auth session (e.g. arriving
// via the manage page's "Back to your Squad Invites" link) should never
// have to re-verify email/OTP just to see their own request list again —
// the session already proves who they are. Same read-only query and shape
// verify-code/route.ts already returns after a fresh OTP verification;
// undefined (not authenticated) is genuinely different from an empty array
// (authenticated, zero requests yet) — OrganiserStart uses that distinction
// to pick its own initial stage.
export default async function SquadInviteStartPage(){
  if(!isSquadInviteMvpEnabled()) notFound();
  const {data:{user}}=await createClient().auth.getUser();
  if(!user) return <OrganiserStart/>;
  const {data:existing}=await createServiceRoleClient().from('squad_invite_requests')
    .select('public_reference,club_team_name,request_status').eq('organiser_profile_id',user.id).order('submitted_at',{ascending:false});
  const initialExistingRequests=(existing??[]).map(r=>({publicReference:r.public_reference,teamName:r.club_team_name,status:r.request_status}));
  return <OrganiserStart initialExistingRequests={initialExistingRequests}/>;
}
