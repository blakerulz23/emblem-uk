import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'development'
    && process.env.SQUAD_INVITE_PREVIEW_ENABLED === 'true'
    && request.nextUrl.pathname.startsWith('/dev/squad-invite-preview')
  ) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
