import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { PARTNER_TERMS_VERSION, parsePartnerApplication } from '@/lib/partner-programme';

export const runtime = 'nodejs';

/**
 * POST /api/partners/apply — the public UK partner application.
 *
 * Writes one `partners` row with status 'applied' for staff to vet at
 * /staff/partners. A second application from the same email is a silent
 * no-op with the same response, so the form never reveals whether an email
 * is already a partner. Never returns database text.
 */
export async function POST(request: NextRequest) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePartnerApplication(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'partner-application', parsed.value.email))) {
    return NextResponse.json({ error: 'Too many attempts — please try again later.' }, { status: 429 });
  }

  const { name, email, platform, profileUrl, audience } = parsed.value;
  const service = createServiceRoleClient();
  const { error } = await service.from('partners').upsert(
    {
      name,
      email,
      platform,
      profile_url: profileUrl,
      audience,
      confirmed_adult: true,
      confirmed_uk: true,
      terms_version: PARTNER_TERMS_VERSION,
    },
    { onConflict: 'email', ignoreDuplicates: true },
  );
  if (error) {
    console.error('partners/apply: insert failed');
    return NextResponse.json({ error: 'Could not send your application — please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
