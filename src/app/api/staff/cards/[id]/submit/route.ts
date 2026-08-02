import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * "Build Profile" — staff has verified the NFC link/profile and is
 * moving a card from Waiting for Setup into the Recently Submitted
 * production stage. Never touches claim_token/player_id/order_id.
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
    .update({ production_status: 'ready_for_programming', production_submitted_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('production_dismissed_at', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
