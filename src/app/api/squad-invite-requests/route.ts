import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';

const ALLOWED=new Set(['submissionKey','organiserName','organiserRole','teamName','ageGroup','expectedSquadSize','deadlineAt','deliveryRecipientName','deliveryRecipientRole','ukDeliveryConfirmed','authorityAccepted','deliveryRecipientAccepted','independentParticipationAccepted','staffReviewAccepted','badgeReference','badgeAuthorityAccepted']);

export async function POST(request:NextRequest){
  if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
  if(!hasValidSquadInviteCsrf(request)) return NextResponse.json({error:'Request unavailable'},{status:403});
  const auth=createClient(); const {data:{user}}=await auth.auth.getUser();
  if(!user?.email||!user.email_confirmed_at) return NextResponse.json({error:'Verified email required'},{status:401});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body||Object.keys(body).some(k=>!ALLOWED.has(k))) return NextResponse.json({error:'Invalid request details'},{status:400});
  if(typeof body.submissionKey!=='string'||!/^[-0-9a-f]{36}$/i.test(body.submissionKey)) return NextResponse.json({error:'Invalid submission key'},{status:400});
  if(body.badgeReference&&!body.badgeAuthorityAccepted) return NextResponse.json({error:'Badge authority declaration required'},{status:400});
  const canonical=JSON.stringify(Object.fromEntries(Object.entries(body).filter(([k])=>k!=='submissionKey').sort(([a],[b])=>a.localeCompare(b))));
  const fingerprint=createHash('sha256').update(canonical).digest('hex');
  const payload={...body}; delete payload.submissionKey;
  const {data,error}=await createServiceRoleClient().rpc('submit_squad_invite_request',{p_profile_id:user.id,p_email:user.email,p_submission_key:body.submissionKey,p_fingerprint:fingerprint,p_payload:payload});
  if(error||!data) return NextResponse.json({error:'Squad Invite request could not be submitted'},{status:409});
  return NextResponse.json(data,{status:(data as {created?:boolean}).created?201:200,headers:{'Cache-Control':'no-store'}});
}
