import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

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
  const reviewMode = process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED === 'true' && process.env.VERCEL_ENV !== 'production';
  const realSquadInviteSurface = path.startsWith('/squad-invite')
    || path.startsWith('/api/squad-invite')
    || path.startsWith('/api/staff/squad-invites');
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
    return response;
  }
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
