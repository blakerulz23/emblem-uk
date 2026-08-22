import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';
import { isInternalDevPreviewEnabled } from '@/lib/dev-preview-mode';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { BUILDER_CSRF_COOKIE } from '@/lib/builder-request-security';
import {
  DISPOSABLE_SQUAD_INVITE_HEADERS,
  isDisposableSquadInviteMvpPreview,
  isRealSquadInviteSurfacePath,
} from '@/lib/squad-invite-preview-safety';

const INTERNAL_DEV_PREVIEW_PATHS = [
  '/test-print',
  '/card-setup-preview',
  '/dev/photo-crop-test',
  '/dev/story-update-scoping-test',
  '/os/prototype-player-profile',
];

function applyDisposableSquadInviteHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(DISPOSABLE_SQUAD_INVITE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * Establishes CSRF context for the anonymous builder flow the same way
 * Squad Invite's exchange/route.ts establishes its own — a random,
 * non-httpOnly, sameSite:strict double-submit token set on first legitimate
 * touch, here the entry PAGE itself rather than a dedicated POST endpoint,
 * so obtaining CSRF context is never itself an unlimited state-changing
 * call. A no-op if the cookie is already present (a returning visit within
 * its 24h lifetime never gets a new one, matching the capability cookie's
 * own lifetime).
 */
function ensureBuilderCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.get(BUILDER_CSRF_COOKIE)?.value) return response;
  response.cookies.set(BUILDER_CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const syntheticPreview = path.startsWith('/dev/squad-invite-preview') || path.startsWith('/review/squad-invite');
  if (syntheticPreview && isSyntheticSquadInvitePreviewEnabled()) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  if (syntheticPreview) {
    return new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
  }
  const internalDevPreview = INTERNAL_DEV_PREVIEW_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (internalDevPreview && !isInternalDevPreviewEnabled()) {
    return new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
  }
  if (internalDevPreview) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
    // /test-print is the only one of these that calls a builder-capability
    // endpoint (render-print) directly, mirroring the real /builder page.
    return path === '/test-print' ? ensureBuilderCsrfCookie(request, response) : response;
  }
  const reviewMode = process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED === 'true' && process.env.VERCEL_ENV !== 'production';
  const realSquadInviteSurface = isRealSquadInviteSurfacePath(path);
  if (realSquadInviteSurface && !isSquadInviteMvpEnabled()) {
    return new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
  }
  if (reviewMode && realSquadInviteSurface) {
    return new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
  }
  if (path === '/squad-invite/access') {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return isDisposableSquadInviteMvpPreview() ? applyDisposableSquadInviteHeaders(response) : response;
  }
  const response = await updateSession(request);
  const withBuilderCsrf = path === '/builder' ? ensureBuilderCsrfCookie(request, response) : response;
  return realSquadInviteSurface && isDisposableSquadInviteMvpPreview()
    ? applyDisposableSquadInviteHeaders(withBuilderCsrf)
    : withBuilderCsrf;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
