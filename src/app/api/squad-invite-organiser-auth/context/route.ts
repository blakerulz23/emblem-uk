import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { SQUAD_INVITE_CSRF_COOKIE } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export async function GET(){
 if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
 const token=randomBytes(32).toString('base64url');
 const response=NextResponse.json({csrfToken:token},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 response.cookies.set(SQUAD_INVITE_CSRF_COOKIE,token,{httpOnly:false,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:3600});
 return response;
}
