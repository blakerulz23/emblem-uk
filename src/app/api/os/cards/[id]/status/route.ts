import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

  const body = (await request.json()) as StatusBody;

  if (body.action !== 'suspend' && body.action !== 'unsuspend') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { error } =
    body.action === 'suspend'
      ? await supabase.rpc('suspend_card', { p_card_id: params.id, p_reason: body.reason ?? null })
      : await supabase.rpc('unsuspend_card', { p_card_id: params.id });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // permanently-revoked / unsupported-reason are both validation-shaped
    // failures, same 400 convention every other RPC-backed route in this
    // codebase already uses for its own raised exceptions.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
