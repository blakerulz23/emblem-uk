import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
const GENERIC={ok:true,message:'If the address can receive a code, it will arrive shortly.'};
export async function POST(request:NextRequest){
 if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
 if(!hasValidSquadInviteCsrf(request)) return NextResponse.json({error:'Request unavailable'},{status:403});
 const body=await request.json().catch(()=>null) as {email?:unknown}|null;const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
 if(email.length<3||email.length>254||!email.includes('@')) return NextResponse.json(GENERIC);
 if(!(await consumeSquadInviteRateLimit(request.headers,'otp-request',email))) return NextResponse.json(GENERIC,{status:429});
 await createClient().auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:undefined}});
 return NextResponse.json(GENERIC,{headers:{'Cache-Control':'no-store'}});
}
