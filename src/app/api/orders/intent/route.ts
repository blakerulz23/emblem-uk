import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withUniqueCodeRetry } from '@/lib/claim-code';

export const runtime = 'nodejs';

/**
 * Called from the single-card builder (PrintFileBlock.tsx) right before its
 * existing Shopify cart redirect. Persists the order intent and, per Core
 * Product Principle #5 (find/create the player before the recipient ever
 * claims), creates the player + its card immediately using the name the
 * builder already collects — rather than waiting for the no-card recovery
 * flow to invent one later. Not claimable until staff approves it on
 * /staff/queue (payment_status stays 'order_intent' — a bare Shopify
 * redirect is never treated as proof of purchase; no webhook exists).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { orderRef, purchaserEmail, playerName, intendedGuardianEmail, printFiles } = body as {
    orderRef?: string;
    purchaserEmail?: string;
    playerName?: string;
    intendedGuardianEmail?: string;
    /** Print-ready PDF captured by the builder before submit. S3 keys only —
     * same shape as the team-order path (order-enquiry/route.ts). */
    printFiles?: Array<{ playerId?: string; playerName?: string; key?: string }>;
  };

  if (!orderRef || !purchaserEmail?.trim()) {
    return NextResponse.json({ error: 'orderRef and purchaserEmail are required' }, { status: 400 });
  }

  const validPrintFiles = Array.isArray(printFiles)
    ? printFiles
        .filter((f) => typeof f?.key === 'string' && f.key.startsWith('print-files/'))
        .map((f) => ({ playerId: f.playerId ?? null, playerName: f.playerName ?? null, key: f.key }))
    : [];

  const serviceRole = createServiceRoleClient();

  const { data: order, error: orderError } = await serviceRole
    .from('orders')
    .insert({
      order_ref: orderRef,
      purchaser_email: purchaserEmail.trim(),
      intended_guardian_email: intendedGuardianEmail?.trim() || null,
      source: 'standalone_order',
      payment_status: 'order_intent',
      print_files: validPrintFiles.length > 0 ? validPrintFiles : null,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Could not record order' }, { status: 500 });
  }

  if (playerName?.trim()) {
    const { data: player, error: playerError } = await serviceRole
      .from('players')
      .insert({ name: playerName.trim() })
      .select()
      .single();

    if (!playerError && player) {
      const cardResult = await withUniqueCodeRetry((code) =>
        serviceRole
          .from('cards')
          .insert({ claim_token: code, player_id: player.id, order_id: order.id, status: 'assigned' })
          .select()
          .single()
      );
      if (cardResult.error) {
        console.warn('Could not create card for standalone order', cardResult.error.message);
      }
    } else {
      console.warn('Could not create player for standalone order', playerError?.message);
    }
  }

  return NextResponse.json({ ok: true, orderId: order.id });
}
