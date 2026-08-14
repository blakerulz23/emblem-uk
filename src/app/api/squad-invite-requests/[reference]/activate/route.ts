import { NextRequest,NextResponse } from 'next/server';
import { createClient,createServiceRoleClient } from '@/lib/supabase/server';
import { createSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
const ALLOWED=new Set(['address','postcode','courierContact','instructions']);
export async function POST(request:NextRequest,{params}:{params:{reference:string}}){
 if(!isSquadInviteMvpEnabled())return NextResponse.json({error:'Not found'},{status:404});
 if(!hasValidSquadInviteCsrf(request))return NextResponse.json({error:'Setup unavailable'},{status:403});
 const {data:{user}}=await createClient().auth.getUser();if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body||Object.keys(body).some(k=>!ALLOWED.has(k)))return NextResponse.json({error:'Invalid delivery setup'},{status:400});
 const values={address:String(body.address??'').trim(),postcode:String(body.postcode??'').trim().toUpperCase(),courierContact:String(body.courierContact??'').trim(),instructions:String(body.instructions??'').trim()};
 const service=createServiceRoleClient();const {data:r}=await service.from('squad_invite_requests').select('id,organiser_profile_id').eq('public_reference',params.reference).maybeSingle();
 if(!r||r.organiser_profile_id!==user.id)return NextResponse.json({error:'Setup unavailable'},{status:404});
 const credential=createSquadInviteLinkToken();const {data,error}=await service.rpc('complete_squad_invite_delivery_and_activate',{p_request_id:r.id,p_organiser_profile_id:user.id,p_address:values.address,p_postcode:values.postcode,p_courier_contact:values.courierContact,p_instructions:values.instructions||null,p_new_link_hash:credential.hash});
 if(error||!data)return NextResponse.json({error:'Setup unavailable'},{status:409});
 const result=data as {created:boolean;status:string};
 return NextResponse.json({...result,invitationPath:result.created?`/squad-invite/access#token=${credential.token}`:null,recoveryRequired:!result.created},{headers:{'Cache-Control':'no-store'}});
}
