import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(createClient());
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('finalise_squad_invite_pricing', { p_campaign_id: params.id });
  if (error) return NextResponse.json({ error: 'Campaign pricing could not be finalised' }, { status: 409 });
  return NextResponse.json({ ok: true, pricing: data, paymentRequestsEnabled: false });
}
