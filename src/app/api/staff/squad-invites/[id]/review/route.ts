import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export async function POST(request:NextRequest,{params}:{params:{id:string}}){
  if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
  const body=await request.json().catch(()=>null) as {action?:string;organiserVisibleReason?:string;restrictedNote?:string}|null;
  const action=body?.action;
  const permission=action==='start_review'||action==='request_changes'?'squad_invite_reviewer':'squad_invite_approver';
  const staff=await requireSquadInvitePermission(createClient(),permission);
  if(!staff.ok) return NextResponse.json({error:staff.error},{status:staff.status});
  if(!['start_review','request_changes','reject'].includes(action??'')) return NextResponse.json({error:'Invalid review action'},{status:400});
  const reason=body?.organiserVisibleReason?.trim()??'';
  if((action==='request_changes'||action==='reject')&&!reason) return NextResponse.json({error:'An organiser-visible explanation is required'},{status:400});
  const service=createServiceRoleClient();
  const {data,error}=await service.rpc('review_squad_invite_request',{p_request_id:params.id,p_staff_profile_id:staff.userId,p_action:action,p_visible_reason:reason||null,p_restricted_note:body?.restrictedNote?.trim()||null});
  if(error||!data) return NextResponse.json({error:'Review transition unavailable'},{status:409});
  return NextResponse.json({ok:true,result:data});
}
