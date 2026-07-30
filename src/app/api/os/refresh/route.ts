import { NextRequest, NextResponse } from 'next/server';
import { getOsAccount, getOsData } from '@/lib/os-data';

export const runtime = 'nodejs';

/**
 * The client-side live-update mechanism: whenever a screen's own
 * useLiveContent subscription (src/app/os/useLiveContent.ts) sees a
 * relevant table change, OsDataContext calls this route and replaces its
 * entire in-memory OsData snapshot — not router.refresh(), no full page
 * reload, no server round-trip through Next's routing layer. Reuses
 * getOsData() verbatim rather than a second, partial computation, so
 * rarity/ordinals/season-matching/signed URLs always stay identical to the
 * SSR path — never a second, drifting source of truth.
 */
export async function GET(request: NextRequest) {
  const { session, profileRole } = await getOsAccount();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const requestedPlayerId = request.nextUrl.searchParams.get('player');
  const data = await getOsData(session.userId, profileRole, requestedPlayerId);
  return NextResponse.json(data);
}
