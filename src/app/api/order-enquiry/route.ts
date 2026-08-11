import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withUniqueCodeRetry } from '@/lib/claim-code';

export const runtime = 'nodejs';

type EnquiryPlayer = {
  id?: string;
  name?: string;
  position?: string;
  kitNo?: string;
  /**
   * Already present on every player in productionPayload()'s output
   * (src/lib/emblem-uk-builder.ts) — not previously read by this route.
   * Persisted into card_definitions below so Collection OS and any future
   * renderer can render the exact approved design, not a re-implementation
   * of it. All optional/best-effort: a missing field just narrows what
   * that surface can render, it never blocks order/player/card creation.
   */
  club?: string;
  badgeUrl?: string;
  badgeSnapshotUrl?: string;
  templateId?: string;
  stats?: Record<string, string>;
  photo?: {
    storageKey?: string;
    contentType?: string;
    crop?: { x?: number; y?: number; scale?: number };
    bgRemoved?: boolean;
  };
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
  /**
   * The authoritative quote from POST /api/pricing/quote (Stage 3/4),
   * copied field-for-field by the client's productionPayload() — never
   * recalculated here. Optional: the builder omits this entirely rather
   * than sending a stale/placeholder block when no confirmed-fresh quote
   * was available at submit time (see ProductionBuilder.tsx's
   * canSendEnquiry/quoteMatchesCurrentCounts). Logged below for
   * observability only — this route still does not validate or persist
   * pricing.
   */
  pricing?: {
    currency?: string;
    pricingTier?: string;
    paidPlayerCount?: number;
    totalPrintQuantity?: number;
    unitPricePence?: number;
    subtotalPence?: number;
    pricingVersion?: number;
    coachCardIncluded?: boolean;
    lineItems?: Array<{ kind?: string; quantity?: number; unitPricePence?: number; subtotalPence?: number }>;
    deliveryPence?: number | null;
    taxPence?: number | null;
    totalPence?: number | null;
  };
  players?: EnquiryPlayer[];
  /**
   * Stage 5B — free coach-card details, built by
   * src/lib/coach-card-draft.ts's buildCoachCardPayload() and sent only for
   * a fresh, eligible, complete draft. Deliberately kept out of `players`
   * (see EnquiryPlayer above) so it can never trigger this route's
   * players/cards/card_definitions provisioning loop below — a coach is not
   * a player and must never get a claim_token.
   *
   * Logged below for staff observability only, exactly like `pricing` —
   * this route does not yet insert into order_coach_cards (migration 0047)
   * or persist this block anywhere. NOT PRODUCTION-READY: Stage 5B only
   * carries the draft this far; Stage 6 must add real validation and a
   * real order_coach_cards insert before this branch can be merged or
   * deployed. Until then, nothing in this response or the builder UI may
   * tell a customer their coach card has been saved — see
   * CoachCardSection.tsx's copy, which deliberately never claims
   * persistence, and ProductionBuilder.tsx's "Order received" success
   * copy, which only speaks to the player cards it actually creates below.
   */
  coachCard?: {
    fullName?: string;
    roleTitle?: string;
    clubName?: string;
    teamName?: string;
    photoKey?: string;
  };
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
    pricingTier: body.pricing?.pricingTier,
    totalPrintQuantity: body.pricing?.totalPrintQuantity,
    subtotalPence: body.pricing?.subtotalPence,
    coachCardIncluded: body.pricing?.coachCardIncluded,
    pricingVersion: body.pricing?.pricingVersion,
    // Presence/shape only — never the coach's name or photo key in logs.
    coachCardReceived: Boolean(body.coachCard?.fullName && body.coachCard?.photoKey),
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
    // Free-text hints only — prefilled into the staff club/team picker at
    // approval time, never applied automatically (see migration 0009's
    // reasoning: auto-matching a club by typed name risks silently
    // merging two different real clubs sharing a common name).
    const clubName = body.order?.club?.trim() || null;
    const teamName = body.contact?.team?.trim() || null;

    let { data: order, error: orderError } = await serviceRole
      .from('orders')
      .insert({
        order_ref: requestId,
        purchaser_email: email!,
        source: 'team_order',
        payment_status: 'order_intent',
        print_files: printFiles.length > 0 ? printFiles : null,
        club_name: clubName,
        team_name: teamName,
      })
      .select()
      .single();

    // Defensive: until migrations 0007 (print_files jsonb) / 0009
    // (club_name/team_name) have run against the live Supabase project,
    // the insert above fails with a column-does-not-exist error. Losing
    // these REFERENCE-only fields is acceptable; losing the whole order
    // row is not — so retry without them rather than silently persisting
    // nothing.
    if (orderError && /(print_files|club_name|team_name)/.test(orderError.message)) {
      console.warn('print_files/club_name/team_name column missing (migration 0007/0009 not run) — inserting order without them');
      ({ data: order, error: orderError } = await serviceRole
        .from('orders')
        .insert({
          order_ref: requestId,
          purchaser_email: email!,
          source: 'team_order',
          payment_status: 'order_intent',
        })
        .select()
        .single());
    }

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
        } else if (cardResult.data) {
          // Best-effort, additive: the Card Definition this order approved.
          // Never blocks card creation above — a card with no linked
          // definition just falls back to today's behaviour until this
          // backfills or a future Builder edit sets one.
          const team = enquiryPlayer.club?.trim() || clubName || '';
          const templateId = enquiryPlayer.templateId?.trim();
          if (team && templateId) {
            const { data: definition, error: definitionError } = await serviceRole
              .from('card_definitions')
              .insert({
                status: 'approved',
                template_id: templateId,
                name: playerName,
                number: enquiryPlayer.kitNo ?? null,
                team,
                position: enquiryPlayer.position ?? null,
                logo: enquiryPlayer.badgeSnapshotUrl ?? enquiryPlayer.badgeUrl ?? null,
                photo: enquiryPlayer.photo?.storageKey
                  ? {
                      storageKey: enquiryPlayer.photo.storageKey,
                      contentType: enquiryPlayer.photo.contentType ?? null,
                      crop: {
                        x: enquiryPlayer.photo.crop?.x ?? 0,
                        y: enquiryPlayer.photo.crop?.y ?? 0,
                        scale: enquiryPlayer.photo.crop?.scale ?? 1,
                      },
                      bgRemoved: enquiryPlayer.photo.bgRemoved ?? false,
                    }
                  : null,
                stats: enquiryPlayer.stats ?? null,
                order_id: order.id,
                player_id: player.id,
              })
              .select()
              .single();

            if (definitionError || !definition) {
              console.warn('Could not create card_definitions row', definitionError?.message);
            } else {
              // withUniqueCodeRetry's generic combined with the untyped
              // Supabase client (no Database schema generic here) resolves
              // .data's type to `never` — same known quirk documented
              // elsewhere in this codebase (see os-data.ts). Cast past it
              // rather than the wrong inferred type; cardResult.data is
              // confirmed non-null by the enclosing `else if` branch.
              const cardId = (cardResult.data as { id: string }).id;
              const { error: linkError } = await serviceRole
                .from('cards')
                .update({ card_definition_id: definition.id })
                .eq('id', cardId);
              if (linkError) {
                console.warn('Could not link card to its card_definitions row', linkError.message);
              }

              // Milestone 4B — seed Collection with a real card_created
              // moment the instant this Card Definition is approved, so
              // Collection is never empty before any parent media exists.
              // Idempotent at the database level (see migration
              // 0020_moments_card_created.sql's partial unique index) — a
              // 23505 here means it already exists, which is success, not
              // an error, exactly like withUniqueCodeRetry's own handling
              // of the same class of race above.
              const { error: momentError } = await serviceRole
                .from('moments')
                .insert({
                  player_id: player.id,
                  title: 'Card Created',
                  occurred_on: definition.created_at ? String(definition.created_at).slice(0, 10) : null,
                  trust: 'club',
                  verification_status: 'system_generated',
                  card_definition_id: definition.id,
                  source: 'system',
                });
              if (momentError && momentError.code !== '23505') {
                console.warn('Could not create card_created moment', momentError.message);
              }
            }
          }
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
