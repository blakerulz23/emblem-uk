import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { effectiveCampaignStatus, mayCompleteExistingBuilder, type CampaignStatus } from '@/lib/squad-invite';
import DeliverySetup from './DeliverySetup';
import CorrectionForm from './CorrectionForm';
import CampaignDashboard from './CampaignDashboard';
import ReplaceInvitationLink from './ReplaceInvitationLink';

export default async function ManageSquadInvite({params}:{params:{reference:string}}){
  if(!isSquadInviteMvpEnabled()) notFound();
  const {data:{user}}=await createClient().auth.getUser();
  if(!user) redirect(`/squad-invite/start?returnTo=${encodeURIComponent(`/squad-invite/manage/${params.reference}`)}`);
  const {data:r}=await createServiceRoleClient().from('squad_invite_requests').select('public_reference,organiser_profile_id,club_team_name,request_status,organiser_visible_reason,campaign_id,squad_invites(campaign_status,deadline_at)').eq('public_reference',params.reference).maybeSingle();
  if(!r||r.organiser_profile_id!==user.id) notFound();
  const campaignRaw=r.squad_invites as unknown;
  const campaign=(Array.isArray(campaignRaw)?campaignRaw[0]:campaignRaw) as {campaign_status:CampaignStatus;deadline_at:string}|undefined;
  const campaignActive=campaign?.campaign_status==='active';
  // 'closed' (0066) means delivery setup already happened — the campaign
  // just isn't accepting new commits any more. Treating it the same as
  // 'active' here is what stops an organiser who's closed their campaign
  // from seeing "delivery setup required" again; CampaignDashboard itself
  // is what actually branches on the difference (Squad progress vs the
  // Closed banner + reopen control).
  const deliverySetupDone=campaignActive||campaign?.campaign_status==='closed';
  const linkReplacementEligible=Boolean(campaign&&mayCompleteExistingBuilder(effectiveCampaignStatus(campaign.campaign_status,campaign.deadline_at)));
  return <div className="mx-auto min-h-screen max-w-2xl px-5 py-16 pb-28"><a href="/squad-invite/start" className="text-sm font-bold text-orange-600 hover:text-orange-700">&larr; Back to your Squad Invites</a><p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">Squad Invite status</p><h1 className="mt-3 text-4xl font-bold">{r.club_team_name}</h1><p className="mt-4 text-neutral-600">Reference {r.public_reference}</p><p className="mt-2 inline-block rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-sm font-bold uppercase tracking-wide">Status: {r.request_status.replaceAll('_',' ')}</p>{deliverySetupDone&&r.campaign_id&&<CampaignDashboard campaignId={r.campaign_id}/>}{r.request_status==='changes_requested'&&<CorrectionForm reference={r.public_reference} reason={r.organiser_visible_reason??'Please update the request.'}/>} {r.request_status==='approved'&&(deliverySetupDone?<section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="text-2xl font-bold text-emerald-900">Delivery setup complete</h2><p className="mt-3 text-emerald-900">Your parent Squad Invite link is active. Payment requests remain disabled.</p></section>:<><section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-2xl font-bold text-amber-900">Approved — delivery setup required</h2><p className="mt-3 text-amber-900">Complete the adult delivery details before the parent invitation can be activated or shared.</p><p className="mt-3 text-amber-900">Payment requests remain disabled.</p></section><DeliverySetup reference={r.public_reference}/></>)}{linkReplacementEligible&&r.campaign_id&&<ReplaceInvitationLink campaignId={r.campaign_id}/>}<p className="mt-8 text-sm text-neutral-600">This public reference identifies the request but does not grant access. Management requires the organiser&apos;s verified session.</p></div>;
}
