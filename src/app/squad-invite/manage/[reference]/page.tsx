import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import DeliverySetup from './DeliverySetup';
import CorrectionForm from './CorrectionForm';
import CampaignDashboard from './CampaignDashboard';

export default async function ManageSquadInvite({params}:{params:{reference:string}}){
  if(!isSquadInviteMvpEnabled()) notFound();
  const {data:{user}}=await createClient().auth.getUser();
  if(!user) redirect(`/squad-invite/start?returnTo=${encodeURIComponent(`/squad-invite/manage/${params.reference}`)}`);
  const {data:r}=await createServiceRoleClient().from('squad_invite_requests').select('public_reference,organiser_profile_id,club_team_name,request_status,organiser_visible_reason,campaign_id,squad_invites(campaign_status,deadline_at)').eq('public_reference',params.reference).maybeSingle();
  if(!r||r.organiser_profile_id!==user.id) notFound();
  const dashboardCampaignRaw=r.squad_invites as unknown;
  const dashboardCampaign=(Array.isArray(dashboardCampaignRaw)?dashboardCampaignRaw[0]:dashboardCampaignRaw) as {campaign_status?:string}|undefined;
  const campaignActive=dashboardCampaign?.campaign_status==='active';
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-16"><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Squad Invite status</p><h1 className="mt-3 text-4xl font-bold">{r.club_team_name}</h1><p className="mt-4">Reference {r.public_reference}</p><p className="mt-2">Status: {r.request_status.replaceAll('_',' ')}</p>{campaignActive&&r.campaign_id&&<CampaignDashboard campaignId={r.campaign_id}/>}{r.request_status==='changes_requested'&&<CorrectionForm reference={r.public_reference} reason={r.organiser_visible_reason??'Please update the request.'}/>} {r.request_status==='approved'&&(campaignActive?<section className="mt-8 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">Delivery setup complete</h2><p className="mt-3">Your parent Squad Invite link is active. Payment requests remain disabled.</p></section>:<><section className="mt-8 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">Approved — delivery setup required</h2><p className="mt-3">Complete the adult delivery details before the parent invitation can be activated or shared.</p><p className="mt-3">Payment requests remain disabled.</p></section><DeliverySetup reference={r.public_reference}/></>)}<p className="mt-8 text-sm">This public reference identifies the request but does not grant access. Management requires the organiser&apos;s verified session.</p></main>;
}
