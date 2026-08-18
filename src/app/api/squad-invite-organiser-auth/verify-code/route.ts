import { NextRequest,NextResponse } from 'next/server';
import { createClient,createServiceRoleClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
export async function POST(request:NextRequest){
 if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
 if(!hasValidSquadInviteCsrf(request)) return NextResponse.json({error:'Verification unavailable'},{status:403});
 const body=await request.json().catch(()=>null) as {email?:unknown;code?:unknown;returnTo?:unknown}|null;const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body?.code==='string'?body.code.trim():'';
 if(!(await consumeSquadInviteRateLimit(request.headers,'otp-verify',email))) return NextResponse.json({error:'Verification unavailable'},{status:429});
 if(email.length<3||email.length>254||!/^\d{6,8}$/.test(code)) return NextResponse.json({error:'Verification unavailable'},{status:400});
 const supabase=createClient();
 const {data,error}=await supabase.auth.verifyOtp({email,token:code,type:'email'});if(error||!data.user)return NextResponse.json({error:'Verification unavailable'},{status:400});
 // A verified auth.users row has no profiles row until something creates
 // one — there is no database trigger for this (see profiles' own RLS-only
 // design in migration 0001). Every other auth entry point in this repo
 // upserts its own minimal profile right after verification; this route
 // was the one place that didn't, which is exactly why
 // submit_squad_invite_request could fail with a foreign_key_violation on
 // squad_invite_requests_organiser_profile_id_fkey for a first-time
 // organiser. ignoreDuplicates makes this a pure no-op for a returning
 // user — role/display_name are never touched, whether the row already
 // existed or not.
 const {error:profileError}=await supabase.from('profiles').upsert({id:data.user.id},{onConflict:'id',ignoreDuplicates:true});
 if(profileError){
   console.error('squad-invite-organiser-auth/verify-code:profile-upsert',profileError.code??'unknown');
   return NextResponse.json({error:'Verification unavailable'},{status:400});
 }
 // Read-only, scoped to exactly the user just verified above — lets the
 // client show existing requests instead of silently starting a duplicate.
 // Service-role because every other squad_invite_requests read in this
 // repo goes through it (no organiser-read RLS policy exists on this
 // table); the eq() below is what keeps this scoped to this one organiser.
 const {data:existing}=await createServiceRoleClient().from('squad_invite_requests')
   .select('public_reference,club_team_name,request_status').eq('organiser_profile_id',data.user.id).order('submitted_at',{ascending:false});
 const existingRequests=(existing??[]).map(r=>({publicReference:r.public_reference,teamName:r.club_team_name,status:r.request_status}));
 return NextResponse.json({ok:true,returnTo:'/squad-invite/start',existingRequests},{headers:{'Cache-Control':'no-store'}});
}
