import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(createClient());
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();
  const { data: batch } = await service.from('campaign_fulfilment_batches').select('id,status,coach_card_included')
    .eq('campaign_id', params.id).maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Fulfilment batch unavailable' }, { status: 404 });
  const { data: items, error } = await service.from('campaign_fulfilment_items')
    .select('package_reference,package_label,package_status').eq('batch_id', batch.id).order('package_reference');
  if (error) return NextResponse.json({ error: 'Manifest unavailable' }, { status: 500 });
  return NextResponse.json({ batchStatus: batch.status, coachCardIncluded: batch.coach_card_included, items: items ?? [] },
    { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' } });
}
