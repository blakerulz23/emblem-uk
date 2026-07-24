import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Lists existing clubs for the staff approve-order club/team picker
 * (ApproveTeamOrderButton). Relies on the existing "clubs: readable by
 * authenticated users" RLS policy — no new policy needed, and no
 * requireStaff gate either, since a plain list of club names carries no
 * sensitive data.
 */
export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase.from('clubs').select('id, name').order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ clubs: data ?? [] });
}
