import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logRouteFailure, raised } from '@/lib/route-failure';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The reasons suspend_card accepts (0075/0076), checked here so a bad value
// is a fixed 400 rather than the function's message, which echoes it.
const SUSPEND_REASONS = new Set(['lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other', 'deletion_request']);
const CARD_STATUS_DENIED_MESSAGE = "You don't have permission to change this card.";
const CARD_STATUS_REVOKED_MESSAGE = 'This card has been permanently revoked and cannot be changed.';
const CARD_STATUS_FAILED_MESSAGE = 'Could not update this card. Please try again.';

/**
 * Guardian-facing card lifecycle control (migration 0075). Deliberately
 * offers only suspend/unsuspend — never revoke — matching this migration's
 * authorization model exactly: a guardian may pause and resume their own
 * child's card themselves, but permanent revocation and replacement
 * issuance are staff-only (see src/app/api/staff/cards/[id]/status/route.ts
 * and .../replace/route.ts). The real authorization + row-locking boundary
 * is entirely inside suspend_card/unsuspend_card (SECURITY DEFINER,
 * guardian-or-staff check re-derived from auth.uid() every call) — this
 * route just calls them and maps errors to the right HTTP status, the same
 * thin-route convention every other RPC-backed route in this codebase
 * already follows (secondary-position/route.ts, coach-fields/route.ts).
 */
type StatusBody = { action?: 'suspend' | 'unsuspend'; reason?: string | null };

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as StatusBody | null;
  if (!body || typeof body !== 'object' || !UUID.test(params.id)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (body.action !== 'suspend' && body.action !== 'unsuspend') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (body.action === 'suspend' && body.reason != null && (typeof body.reason !== 'string' || !SUSPEND_REASONS.has(body.reason))) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  }

  const { error } =
    body.action === 'suspend'
      ? await supabase.rpc('suspend_card', { p_card_id: params.id, p_reason: body.reason ?? null })
      : await supabase.rpc('unsuspend_card', { p_card_id: params.id });

  // Database text never reaches the caller or the log. Each known refusal
  // is a fixed status and message (a missing card is "not authorized", as
  // the functions report it, so a card's existence isn't revealed); a
  // revoked card is a conflict with its state; anything else is a generic
  // 500 that logs only the error code.
  if (error) {
    if (raised(error, 'Not authenticated')) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    if (raised(error, 'Not authorized')) {
      return NextResponse.json({ error: CARD_STATUS_DENIED_MESSAGE }, { status: 403 });
    }
    if (raised(error, 'permanently revoked')) {
      return NextResponse.json({ error: CARD_STATUS_REVOKED_MESSAGE }, { status: 409 });
    }
    if (raised(error, 'Unsupported reason')) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
    }
    logRouteFailure(body.action === 'suspend' ? 'card status: suspend' : 'card status: unsuspend', error);
    return NextResponse.json({ error: CARD_STATUS_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
