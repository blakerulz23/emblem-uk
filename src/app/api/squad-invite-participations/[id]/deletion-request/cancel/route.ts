import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { error } = await supabase.rpc('cancel_own_squad_invite_participation_deletion_request', {
    p_participation_id: params.id,
  });
  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Only the guardian who committed this participation can cancel this request' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
