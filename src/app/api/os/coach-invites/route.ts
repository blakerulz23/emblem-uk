import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCoachInvite } from '@/lib/create-coach-invite';

export const runtime = 'nodejs';

/**
 * A guardian creates a direct-coach invite for their player — the
 * guardian-initiated, email-first "Add Coach" flow (architecture milestone
 * plan; coach-generated codes/QR are explicitly out of scope). Mirrors
 * /api/os/invites/route.ts: the actual authority check is
 * "coach_invites: guardians can create for their player" RLS, enforced by
 * passing the session-scoped client into createCoachInvite — this route
 * never independently re-checks the guardian relationship itself, so
 * there is exactly one place ("who may create this row") to keep correct.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { playerId, invitedEmail } = body as { playerId?: string; invitedEmail?: string };
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }

  const result = await createCoachInvite(supabase, playerId, user.id, invitedEmail);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  return NextResponse.json({
    ok: true,
    code: result.code,
    url: `${siteUrl}/os?coachinvite=${encodeURIComponent(result.code)}`,
    reused: result.reused,
    // 'sent' | 'failed' | 'skipped_no_email' — the guardian-facing UI
    // branches its copy on this directly; the invite/link above are
    // valid regardless of which value comes back (email delivery is
    // never a requirement for the invitation itself to exist).
    emailStatus: result.emailStatus,
  });
}
