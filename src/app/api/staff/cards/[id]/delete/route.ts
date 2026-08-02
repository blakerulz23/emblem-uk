import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * "Delete" — clears a completed card off the production desk. Despite
 * the name, this is a soft flag (production_dismissed_at), never a real
 * DELETE: the order, player, cards row and claim_token must all survive
 * untouched so NFC/Player OS keep working. Every queue query filters
 * production_dismissed_at is null, so this row simply stops appearing.
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
    .update({ production_dismissed_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
