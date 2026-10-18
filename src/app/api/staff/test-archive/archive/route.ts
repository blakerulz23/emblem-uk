import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { archiveConfirmationPhrase, parseCardIds } from '@/lib/test-archive';

export const runtime = 'nodejs';

/**
 * Archives internal test cards out of the staff queues. Soft and
 * reversible: archive_test_cards (migration 0088) re-checks every card,
 * refuses anything with payment history or that may physically exist,
 * writes an audit event per card and never deletes a row.
 */
export async function POST(request: Request) {
  const staff = await requireSquadInvitePermission(createClient(), 'test_data_admin');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

  const body = (await request.json().catch(() => null)) as { cardIds?: unknown; reason?: unknown; confirmation?: unknown } | null;
  const cardIds = parseCardIds(body?.cardIds);
  if (!cardIds) return NextResponse.json({ error: 'Choose between 1 and 100 cards' }, { status: 400 });
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
  if (body?.confirmation !== archiveConfirmationPhrase(cardIds.length)) {
    return NextResponse.json({ error: `Type ${archiveConfirmationPhrase(cardIds.length)} to confirm` }, { status: 400 });
  }

  const { data, error } = await createServiceRoleClient().rpc('archive_test_cards', {
    p_card_ids: cardIds, p_actor: staff.userId, p_reason: reason,
  });
  if (error) return NextResponse.json({ error: 'Cards could not be archived' }, { status: 409 });
  return NextResponse.json({ ok: true, results: data ?? [] });
}
