import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
export async function POST(request:NextRequest){
 if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
 if(!hasValidSquadInviteCsrf(request)) return NextResponse.json({error:'Verification unavailable'},{status:403});
 const body=await request.json().catch(()=>null) as {email?:unknown;code?:unknown;returnTo?:unknown}|null;const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body?.code==='string'?body.code.trim():'';
 if(!(await consumeSquadInviteRateLimit(request.headers,'otp-verify',email))) return NextResponse.json({error:'Verification unavailable'},{status:429});
 if(email.length<3||email.length>254||!/^\d{6,8}$/.test(code)) return NextResponse.json({error:'Verification unavailable'},{status:400});
 const {error}=await createClient().auth.verifyOtp({email,token:code,type:'email'});if(error)return NextResponse.json({error:'Verification unavailable'},{status:400});
 return NextResponse.json({ok:true,returnTo:'/squad-invite/start'},{headers:{'Cache-Control':'no-store'}});
}
