import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withUniqueCodeRetry } from '@/lib/claim-code';

export const runtime = 'nodejs';

type EnquiryPlayer = {
  id?: string;
  name?: string;
  position?: string;
  kitNo?: string;
};

type EnquiryBody = {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    team?: string;
    notes?: string;
  };
  order?: {
    id?: string;
    type?: string;
    club?: string;
  };
  pricing?: {
    approvedPrints?: number;
    subtotal?: number;
  };
  players?: EnquiryPlayer[];
  submittedAt?: string;
  /** Client-generated order reference — generated once, reused everywhere
   * (print PDF metadata, DB row, Shopify cart attribute). Server falls
   * back to its own ref if absent/invalid. */
  orderRef?: string;
  /** Print-ready PDFs captured by the builder before submit. S3 keys only —
   * staff re-sign download URLs from these on /staff/queue. */
  printFiles?: Array<{ playerId?: string; playerName?: string; key?: string }>;
};

export async function POST(request: Request) {
  let body: EnquiryBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid production request payload' }, { status: 400 });
  }

  const name = body.contact?.name?.trim();
  const email = body.contact?.email?.trim();
  const hasEmail = Boolean(email && /\S+@\S+\.\S+/.test(email));
  const players = Array.isArray(body.players) ? body.players : [];
  const approvedPlayers = players.length;

  if (!name || !hasEmail) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  if (approvedPlayers < 1) {
    return NextResponse.json({ error: 'Approve at least one card before sending' }, { status: 400 });
  }

  // This is intentionally a thin handoff point. It can be connected to email,
  // a CRM, Supabase, Airtable, or Shopify draft orders without changing the UI.
  console.info('Emblem production request received', {
    orderId: body.order?.id,
    orderType: body.order?.type,
    club: body.order?.club,
    approvedPlayers,
    approvedPrints: body.pricing?.approvedPrints,
    subtotal: body.pricing?.subtotal,
    contact: {
      name,
      email,
      phone: body.contact?.phone,
      team: body.contact?.team,
    },
    submittedAt: body.submittedAt,
  });

  const clientRef = body.orderRef?.trim();
  const requestId = clientRef && /^[a-z0-9][a-z0-9-]{5,63}$/i.test(clientRef)
    ? clientRef
    : `emblem-${Date.now()}`;

  const printFiles = Array.isArray(body.printFiles)
    ? body.printFiles
        .filter((f) => typeof f?.key === 'string' && f.key.startsWith('print-files/'))
        .map((f) => ({ playerId: f.playerId ?? null, playerName: f.playerName ?? null, key: f.key }))
    : [];

  // Real player + card provisioning per Emblem OS Phase 1 (Core Product
  // Principle #5 — a coach's roster must already exist before a parent
  // ever reaches a claim screen). This order's players aren't claimable
  // until staff approves it on /staff/queue, matching "team enquiries
  // create provisional records that aren't claimable until approved."
  const serviceRole = createServiceRoleClient();
  try {
    const { data: order, error: orderError } = await serviceRole
      .from('orders')
      .insert({
        order_ref: requestId,
        purchaser_email: email!,
        source: 'team_order',
        payment_status: 'order_intent',
        print_files: printFiles.length > 0 ? printFiles : null,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.warn('Could not persist team order', orderError?.message);
    } else {
      for (const enquiryPlayer of players) {
        const playerName = enquiryPlayer.name?.trim();
        if (!playerName) continue;

        const { data: player, error: playerError } = await serviceRole
          .from('players')
          .insert({
            name: playerName,
            position: enquiryPlayer.position ?? null,
            squad_number: enquiryPlayer.kitNo ? Number(enquiryPlayer.kitNo) || null : null,
          })
          .select()
          .single();

        if (playerError || !player) {
          console.warn('Could not create roster player', playerError?.message);
          continue;
        }

        const cardResult = await withUniqueCodeRetry((code) =>
          serviceRole
            .from('cards')
            .insert({ claim_token: code, player_id: player.id, order_id: order.id, status: 'assigned' })
            .select()
            .single()
        );
        if (cardResult.error) {
          console.warn('Could not create card for roster player', cardResult.error.message);
        }
      }
    }
  } catch (err) {
    // Never let order/roster persistence failures block the existing
    // enquiry-handoff UX — this stays a thin, best-effort addition.
    console.warn('Order/roster persistence failed', err);
  }

  return NextResponse.json({
    ok: true,
    message: 'Production request received',
    requestId,
  });
}
