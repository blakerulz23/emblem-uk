import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Automatic 90-day deletion of routine card artwork (founder retention
 * schedule: "Card artwork / print PDF: 90 days after delivery"). This is
 * ordinary-operation retention, distinct from the immediate override an
 * approved erasure request already applies (confirm_player_deletion_
 * erasure / confirm_squad_invite_participation_erasure, migration 0076)
 * — this sweep is what handles every card that is never the subject of a
 * deletion request at all.
 *
 * KNOWN LIMITATION, documented rather than silently assumed: no
 * "confirmed delivery" timestamp exists anywhere in this schema — checked
 * `orders` and `cards` directly via the live catalog, neither has one.
 * `cards.production_dismissed_at` (staff marking a production item
 * handled) is the closest existing signal, not a genuine delivery
 * confirmation. Per the required "fail closed if delivery time is
 * missing" property, this sweep only ever acts on rows that DO have this
 * timestamp set — a card that was produced but never had this field
 * populated is left untouched indefinitely, not swept on a guess. Once a
 * real delivery-confirmation field exists, point this query at it
 * instead.
 */
const ARTWORK_RETENTION_DAYS = 90;

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceRole = createServiceRoleClient();
  const cutoff = new Date(Date.now() - ARTWORK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = { cardsProcessed: 0, objectsDeleted: 0, errors: [] as string[] };

  const { data: cards } = await serviceRole
    .from('cards')
    .select('id, card_definition_id')
    .eq('production_status', 'completed')
    .not('production_dismissed_at', 'is', null)
    .lt('production_dismissed_at', cutoff)
    .not('card_definition_id', 'is', null);

  for (const card of cards ?? []) {
    if (!card.card_definition_id) continue;
    const { data: def } = await serviceRole
      .from('card_definitions')
      .select('photo')
      .eq('id', card.card_definition_id)
      .maybeSingle();
    const key = (def?.photo as { storageKey?: string } | null)?.storageKey;
    if (!key) {
      results.cardsProcessed += 1;
      continue;
    }
    try {
      await deleteObject(key);
      await serviceRole.from('card_definitions').update({ photo: null }).eq('id', card.card_definition_id);
      results.objectsDeleted += 1;
    } catch (err) {
      results.errors.push(`card ${card.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    results.cardsProcessed += 1;
  }

  return NextResponse.json({ ok: results.errors.length === 0, ...results });
}
