import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { SQUAD_INVITE_CSRF_COOKIE } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

// Every sibling route that issues a per-request cookie (e.g.
// squad-invite-links/context/route.ts) reads an incoming cookie/header via
// next/headers, which itself opts a route into dynamic rendering. This
// route has nothing to read — it only writes a fresh token — so without
// an explicit opt-out Next.js can treat it as static and Vercel's edge can
// cache the response (confirmed live: X-Vercel-Cache: HIT, same cached
// csrfToken/Set-Cookie served to every visitor, despite the in-response
// Cache-Control: no-store header below — that header alone does not
// prevent Next.js's own static classification). force-dynamic is the
// correct fix for exactly this shape of route.
export const dynamic = 'force-dynamic';

export async function GET(){
 if(!isSquadInviteMvpEnabled()) return NextResponse.json({error:'Not found'},{status:404});
 const token=randomBytes(32).toString('base64url');
 const response=NextResponse.json({csrfToken:token},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 response.cookies.set(SQUAD_INVITE_CSRF_COOKIE,token,{httpOnly:false,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:3600});
 return response;
}
