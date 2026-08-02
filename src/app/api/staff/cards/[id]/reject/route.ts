import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * "Reject" — returns a card from Recently Submitted back to Waiting for
 * Setup for rework. Nothing is ever deleted; production_submitted_at is
 * explicitly nulled (not just left stale) so a later re-submission sorts
 * correctly by its new timestamp.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole
    .from('cards')
    .update({ production_status: 'needs_setup', production_submitted_at: null })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
