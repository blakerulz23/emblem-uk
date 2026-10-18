import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { parseCardIds, restoreConfirmationPhrase } from '@/lib/test-archive';

export const runtime = 'nodejs';

/** Restores archived test cards to the staff queues (restore_test_cards, migration 0088). */
export async function POST(request: Request) {
  const staff = await requireSquadInvitePermission(createClient(), 'test_data_admin');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

  const body = (await request.json().catch(() => null)) as { cardIds?: unknown; confirmation?: unknown } | null;
  const cardIds = parseCardIds(body?.cardIds);
  if (!cardIds) return NextResponse.json({ error: 'Choose between 1 and 100 cards' }, { status: 400 });
  if (body?.confirmation !== restoreConfirmationPhrase(cardIds.length)) {
    return NextResponse.json({ error: `Type ${restoreConfirmationPhrase(cardIds.length)} to confirm` }, { status: 400 });
  }

  const { data, error } = await createServiceRoleClient().rpc('restore_test_cards', {
    p_card_ids: cardIds, p_actor: staff.userId,
  });
  if (error) return NextResponse.json({ error: 'Cards could not be restored' }, { status: 409 });
  return NextResponse.json({ ok: true, results: data ?? [] });
}
