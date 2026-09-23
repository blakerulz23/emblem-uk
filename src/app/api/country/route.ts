import { NextResponse, type NextRequest } from 'next/server';
import { COUNTRY_COOKIE, configuredSiteUrls, parseCountryChoice, sharedCookieDomain } from '@/lib/geo-routing';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

/**
 * Footer country switcher: /api/country?to=us&next=/pricing remembers the
 * visitor's pick (a cookie shared by every *.emblem.cards site, so the
 * geo redirect never overrides it) and sends them to that site. Only ever
 * redirects to one of the three configured Emblem addresses.
 */
export function GET(request: NextRequest) {
  const to = parseCountryChoice(request.nextUrl.searchParams.get('to'));
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const urls = configuredSiteUrls();
  if (!to || !urls) {
    return new NextResponse(null, { status: 303, headers: { Location: next } });
  }
  const response = NextResponse.redirect(`${urls[to]}${next}`, 303);
  response.cookies.set({
    name: COUNTRY_COOKIE,
    value: to,
    path: '/',
    domain: sharedCookieDomain(urls),
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
