import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SQUAD_INVITE_CSRF_COOKIE } from '@/lib/squad-invite-request-security';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

// A valid existing token has this exact shape (see hasValidDoubleSubmitCsrf
// in squad-invite-request-security.ts) — checked here so a malformed or
// forged cookie value is never echoed back as if it were trustworthy.
const CSRF_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

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
 // Reuse an already-valid token instead of always minting a new one. This
 // route is called independently by several sibling components on the
 // same page (CampaignDashboard, CloseCampaignButton, DeliverySetup,
 // ReplaceInvitationLink) — each used to mint its own fresh token and
 // overwrite the shared cookie, so whichever call's response landed last
 // silently invalidated every other component's already-held token,
 // producing a 403 on the next real request. Reusing the existing cookie
 // when it's already well-formed makes concurrent calls converge on the
 // same value instead of racing each other; a genuinely new visitor (no
 // cookie yet, or a stale/malformed one) still gets a freshly minted token.
 const existingToken=cookies().get(SQUAD_INVITE_CSRF_COOKIE)?.value??'';
 const token=CSRF_TOKEN_RE.test(existingToken)?existingToken:randomBytes(32).toString('base64url');
 const response=NextResponse.json({csrfToken:token},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 response.cookies.set(SQUAD_INVITE_CSRF_COOKIE,token,{httpOnly:false,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:3600});
 return response;
}
