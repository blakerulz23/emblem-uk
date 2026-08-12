import { priceOrder } from './pricing-engine';
import { templates } from './emblem-uk-builder';
import { EMJFL_CLUBS } from './emjfl-clubs';

/**
 * Stage 6 — pure request validation + authoritative-pricing derivation for
 * POST /api/order-enquiry, split out of the route handler so it can be
 * unit-tested directly (no Next.js request object, no Supabase client),
 * matching this repo's established split between pure logic and I/O (see
 * src/lib/pricing-quote-controller.ts vs its React hook, src/lib/coach-
 * card-draft.ts vs CoachCardSection.tsx). route.ts's only remaining job is
 * parsing the request body, calling this function, calling
 * verifySubmittedAssetKeys() with its result, calling the
 * create_authoritative_order RPC with that *same* result, and shaping the
 * response — no validation, asset-key derivation, or pricing logic of its
 * own.
 *
 * Asset inventory (see the Stage 6 asset-completeness report for the full
 * audit): four private-S3 categories can appear in a real submission —
 * each player's source photo (required, persisted in card_definitions.
 * photo), the coach's photo (required when eligible, persisted in
 * order_coach_cards.photo_key), each player's rendered print file
 * (required for fulfilment, persisted in orders.print_files, read back by
 * /staff/queue), and an optional per-player club badge upload
 * (badgeStorageKey — submitted, but *not* currently persisted as a key;
 * see the report for why that's flagged rather than silently changed
 * here). Every one of these is validated below and re-verified against S3
 * in verifySubmittedAssetKeys() before the RPC ever runs.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PLAYERS = 200;
const MAX_PRINTS_PER_PLAYER = 100;
const MAX_BODY_PLAYERS_FIELD = 500;

const TEMPLATE_IDS = new Set(templates.map((template) => template.id));
const OFFICIAL_BADGE_PATHS = new Set(EMJFL_CLUBS.map((club) => club.badgePath));

export type EnquiryPlayer = {
  id?: string;
  name?: string;
  position?: string;
  kitNo?: string;
  prints?: number;
  club?: string;
  badgeUrl?: string;
  badgeSnapshotUrl?: string;
  /** The real, private S3 key for a custom-collection player's uploaded
   *  badge (see uploadOrderAsset's kind:'badge' in ProductionBuilder.tsx).
   *  Optional — absent for Official Collection players (their badge is a
   *  static public app asset, never uploaded) and for any player who
   *  hasn't picked a custom badge. When present, verified in S3 exactly
   *  like a photo key — see the asset-completeness report for why it is
   *  *not* currently the value persisted into card_definitions.logo. */
  badgeStorageKey?: string;
  templateId?: string;
  stats?: Record<string, string>;
  photo?: {
    storageKey?: string;
    contentType?: string;
    crop?: { x?: number; y?: number; scale?: number };
    bgRemoved?: boolean;
  };
};

export type EnquiryCoachCard = {
  fullName?: string;
  roleTitle?: string;
  clubName?: string;
  teamName?: string;
  photoKey?: string;
};

export type EnquiryBody = {
  contact?: { name?: string; email?: string; phone?: string; team?: string; notes?: string };
  order?: { id?: string; type?: string; club?: string };
  submissionKey?: string;
  pricing?: {
    pricingTier?: string;
    paidPlayerCount?: number;
    totalPrintQuantity?: number;
    subtotalPence?: number;
    coachCardIncluded?: boolean;
  };
  players?: EnquiryPlayer[];
  coachCard?: EnquiryCoachCard;
  submittedAt?: string;
  orderRef?: string;
  printFiles?: Array<{ playerId?: string; playerName?: string; key?: string }>;
};

export interface ValidatedRpcParams {
  p_submission_key: string;
  p_request_fingerprint: string;
  p_order_ref: string;
  p_purchaser_email: string;
  p_source: 'team_order';
  // Non-nullable and exactly one entry per p_players entry, in the same
  // order — a hard completeness requirement for every new authoritative
  // submission (see validateOrderEnquiry's print-file section). Never
  // affects historical orders, whose print_files may still be null.
  p_print_files: Array<{ playerId: string; playerName: string | null; key: string }>;
  p_club_name: string | null;
  p_team_name: string | null;
  p_currency: string;
  p_pricing_tier: string;
  p_paid_player_count: number;
  p_total_print_quantity: number;
  p_unit_price_pence: number;
  p_subtotal_pence: number;
  p_pricing_version: number;
  p_players: Array<{
    id: string;
    name: string;
    position: string | null;
    kitNo: string | null;
    prints: number;
    club: string;
    templateId: string | null;
    badgeSnapshotUrl: string | null;
    badgeUrl: string | null;
    badgeStorageKey: string | null;
    photoKey: string;
    photo: { storageKey: string; contentType: string | null; crop: { x: number; y: number; scale: number }; bgRemoved: boolean };
    stats: Record<string, string> | null;
  }>;
  p_coach_card: { fullName: string; roleTitle: string; clubName: string; teamName: string; photoKey: string } | null;
}

export interface ValidationSuccess {
  ok: true;
  params: ValidatedRpcParams;
  /** The exact, deduplicated set of private-S3 keys this submission
   *  references, categorised — the single source of truth
   *  verifySubmittedAssetKeys() checks against S3, and (by construction,
   *  since it's derived from the same `params` returned alongside it)
   *  provably the same set that ends up in the RPC call. route.ts must
   *  never re-derive this list itself. */
  assetsToVerify: AssetToVerify[];
  /** Server-derived values worth logging for observability — never the
   *  client's own pricing block, which is read (if present) only for a
   *  freshness comparison the caller may choose to log alongside these. */
  observability: {
    paidPlayerCount: number;
    totalPrintQuantity: number;
    pricingTier: string;
    subtotalPence: number;
    coachCardIncluded: boolean;
  };
}

export interface ValidationFailure {
  ok: false;
  status: number;
  error: string;
}

export function isValidNamespacedKey(key: unknown, prefix: string): key is string {
  // A strict prefix match alone already rejects blob:/data:/http(s):// URLs
  // and any other submission's key, since none of those can ever start
  // with this exact submission's literal namespace prefix — no leniency
  // for near-miss formats.
  return typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length && !key.includes('..');
}

function fail(status: number, error: string): ValidationFailure {
  return { ok: false, status, error };
}

/** Asset-category rules — see verifySubmittedAssetKeys(). 'photo' covers
 *  player source photos, the coach photo, and badge uploads: all three go
 *  through the exact same /api/order-assets pipeline with the exact same
 *  format/size limits. 'print-file' is the rendered front+back PDF. */
const ASSET_RULES = {
  photo: {
    allowedContentTypes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
    // Matches /api/order-assets/route.ts's own 18MB limit exactly — that
    // route is this key's only possible source, so anything larger could
    // never have been a genuine upload through it.
    maxBytes: 18 * 1024 * 1024,
  },
  'print-file': {
    allowedContentTypes: new Set(['application/pdf']),
    // Generous bound for a 2-page, 300dpi trading-card PDF (see
    // src/lib/print-specs.ts) — well above any real render, matching this
    // codebase's established "generous ceiling, not a tight estimate"
    // convention (see /api/pricing/quote's MAX_SAFE_QUANTITY).
    maxBytes: 25 * 1024 * 1024,
  },
} as const;

export interface AssetToVerify {
  key: string;
  label: string;
  category: keyof typeof ASSET_RULES;
}

/**
 * Validates an /api/order-enquiry request body, derives authoritative
 * pricing from the validated players via priceOrder() (the client's own
 * `pricing` block is never used for anything persisted), validates the
 * coach card against that authoritative result, and builds the exact
 * parameter object create_authoritative_order expects — or returns a
 * specific rejection reason/status with nothing built.
 */
export function validateOrderEnquiry(
  body: EnquiryBody,
  options: { now?: () => number; fingerprint: (input: string) => string },
): ValidationSuccess | ValidationFailure {
  const name = body.contact?.name?.trim();
  const email = body.contact?.email?.trim();
  const hasEmail = Boolean(email && /\S+@\S+\.\S+/.test(email));
  if (!name || !hasEmail) {
    return fail(400, 'Name and email are required');
  }

  const submissionKey = body.submissionKey;
  if (typeof submissionKey !== 'string' || !UUID_RE.test(submissionKey)) {
    return fail(400, 'A valid submission key is required');
  }
  const assetPrefix = `order-assets/${submissionKey}/`;
  const printFilePrefix = `print-files/${submissionKey}/`;

  const rawPlayers = Array.isArray(body.players) ? body.players : [];
  if (rawPlayers.length < 1) {
    return fail(400, 'Approve at least one card before sending');
  }
  if (rawPlayers.length > MAX_BODY_PLAYERS_FIELD) {
    return fail(400, 'Too many players in one submission');
  }

  const seenIds = new Set<string>();
  const players: ValidatedRpcParams['p_players'] = [];
  const assetsToVerify: AssetToVerify[] = [];
  const seenAssetKeys = new Set<string>();

  /** Adds a key to the verification list at most once — a badge and a
   *  photo (or two players who somehow shared a key) never get HeadObject
   *  checked twice for the same key, matching "every required key is
   *  checked exactly once after deduplication". */
  function queueAsset(key: string, label: string, category: keyof typeof ASSET_RULES) {
    if (seenAssetKeys.has(key)) return;
    seenAssetKeys.add(key);
    assetsToVerify.push({ key, label, category });
  }

  for (const raw of rawPlayers) {
    const id = raw.id?.trim();
    const playerName = raw.name?.trim();
    const prints = raw.prints;
    const storageKey = raw.photo?.storageKey;

    if (!id) return fail(400, 'Every player requires an id');
    if (seenIds.has(id)) return fail(400, 'Duplicate player identifiers in submission');
    seenIds.add(id);

    if (!playerName) return fail(400, 'Every player requires a name');
    if (!Number.isInteger(prints) || (prints as number) < 1 || (prints as number) > MAX_PRINTS_PER_PLAYER) {
      return fail(400, `Invalid print quantity for player ${id}`);
    }
    if (!isValidNamespacedKey(storageKey, assetPrefix)) {
      return fail(400, 'A player photo does not belong to this submission');
    }
    if (raw.templateId && !TEMPLATE_IDS.has(raw.templateId as (typeof templates)[number]['id'])) {
      return fail(400, `Unknown template for player ${id}`);
    }

    // Optional — only present for a Custom Collection player who uploaded
    // their own badge. A *malformed* value (present but not a real
    // namespaced key) is rejected outright rather than silently dropped,
    // since a value that looks like tampering should never be quietly
    // ignored.
    let badgeStorageKey: string | null = null;
    if (raw.badgeStorageKey !== undefined) {
      if (!isValidNamespacedKey(raw.badgeStorageKey, assetPrefix)) {
        return fail(400, `Badge upload for player ${id} does not belong to this submission`);
      }
      badgeStorageKey = raw.badgeStorageKey;
    }

    const suppliedBadgeValues = [raw.badgeSnapshotUrl?.trim(), raw.badgeUrl?.trim()].filter(
      (value): value is string => Boolean(value),
    );
    let staticBadgePath: string | null = null;
    if (!badgeStorageKey && suppliedBadgeValues.length > 0) {
      if (suppliedBadgeValues.some((value) => !OFFICIAL_BADGE_PATHS.has(value))) {
        return fail(400, `Badge reference for player ${id} is not a recognised static asset`);
      }
      if (new Set(suppliedBadgeValues).size > 1) {
        return fail(400, `Conflicting badge references for player ${id}`);
      }
      staticBadgePath = suppliedBadgeValues[0];
    }

    queueAsset(storageKey, `player ${id} photo`, 'photo');
    if (badgeStorageKey) queueAsset(badgeStorageKey, `player ${id} badge`, 'photo');

    players.push({
      id,
      name: playerName,
      position: raw.position?.trim() || null,
      kitNo: raw.kitNo?.trim() || null,
      prints: prints as number,
      club: raw.club?.trim() || '',
      templateId: raw.templateId?.trim() || null,
      // Preview URLs for uploaded badges are display-only. The normalized
      // RPC payload carries only the verified key or a known static path.
      badgeSnapshotUrl: staticBadgePath,
      badgeUrl: null,
      badgeStorageKey,
      photoKey: storageKey,
      photo: {
        storageKey,
        contentType: raw.photo?.contentType ?? null,
        crop: { x: raw.photo?.crop?.x ?? 0, y: raw.photo?.crop?.y ?? 0, scale: raw.photo?.crop?.scale ?? 1 },
        bgRemoved: raw.photo?.bgRemoved ?? false,
      },
      stats: raw.stats ?? null,
    });
  }
  if (players.length > MAX_PLAYERS) {
    return fail(400, 'Too many players in one submission');
  }

  const coachCardRaw = body.coachCard;
  if (coachCardRaw?.photoKey && players.some((player) => player.photoKey === coachCardRaw.photoKey)) {
    return fail(400, 'Coach photo cannot be reused as a player photo');
  }

  const paidPlayerCount = players.length;
  const totalPrintQuantity = players.reduce((sum, player) => sum + player.prints, 0);

  let priced;
  try {
    priced = priceOrder({ paidPlayerCount, totalPrintQuantity });
  } catch {
    return fail(400, 'Could not price this order');
  }

  let coachCardForRpc: ValidatedRpcParams['p_coach_card'] = null;
  if (priced.coachCardEligible) {
    if (!coachCardRaw) {
      return fail(400, 'A squad order requires complete coach card details');
    }
    const fullName = coachCardRaw.fullName?.trim();
    const roleTitle = coachCardRaw.roleTitle?.trim();
    const clubName = coachCardRaw.clubName?.trim();
    const teamName = coachCardRaw.teamName?.trim();
    const photoKey = coachCardRaw.photoKey;
    if (!fullName || !roleTitle || !clubName || !teamName || !isValidNamespacedKey(photoKey, assetPrefix)) {
      return fail(400, 'Incomplete or invalid coach card details');
    }
    if (!players.some((player) => player.club === clubName) || !players.some((player) => player.club === teamName)) {
      return fail(400, 'Coach club/team is not part of this order');
    }
    coachCardForRpc = { fullName, roleTitle, clubName, teamName, photoKey };
    queueAsset(photoKey, 'coach photo', 'photo');
  } else if (coachCardRaw) {
    return fail(400, 'Coach card is not eligible for this order');
  }

  // Print files — required for fulfilment (staff/queue re-signs and
  // downloads these). Stage 6 asset-integrity amendment: now a hard
  // completeness requirement for every NEW authoritative submission —
  // exactly one verified PDF per submitted approved player, no more, no
  // fewer. This is strictly an upstream (validation-layer) requirement; it
  // never touches a historical order, whose print_files may still be null
  // (rows written by the pre-Stage-6 path, or before this amendment).
  //
  // Every entry must belong to THIS submission's own
  // print-files/<submissionKey>/ namespace (not just any print-files/ key
  // — a bare category prefix would let one order reference another's
  // already-rendered file) and must name a player that is genuinely part
  // of this same submission. A malformed, foreign, duplicate, or missing
  // entry is rejected outright — never silently filtered or defaulted —
  // since any of those would mean a card silently entering production
  // with no print file, or one player's PDF standing in for another's.
  const rawPrintFiles = Array.isArray(body.printFiles) ? body.printFiles : [];
  if (rawPrintFiles.length === 0) {
    return fail(400, 'A print file is required for every approved player');
  }

  const printFileByPlayerId = new Map<string, { playerName: string | null; key: string }>();
  for (const file of rawPrintFiles) {
    const key = file?.key;
    const playerId = file?.playerId;
    if (typeof key !== 'string' || typeof playerId !== 'string' || playerId.length === 0) {
      return fail(400, 'A print file entry is malformed');
    }
    if (!isValidNamespacedKey(key, printFilePrefix)) {
      return fail(400, 'A print file does not belong to this submission');
    }
    if (!seenIds.has(playerId)) {
      return fail(400, 'A print file references a player outside this submission');
    }
    if (printFileByPlayerId.has(playerId)) {
      return fail(400, 'Duplicate print file for the same player');
    }
    printFileByPlayerId.set(playerId, { playerName: file?.playerName ?? null, key });
  }

  // Deterministic ordering: built in the same order `players` was built
  // (submitted player order / stable player draft id), never the order
  // printFiles happened to arrive in the request — this exact list is what
  // gets S3-verified, fingerprinted, sent to the RPC, and ultimately
  // persisted to orders.print_files; nothing downstream re-derives it.
  const printFiles: ValidatedRpcParams['p_print_files'] = [];
  for (const player of players) {
    const entry = printFileByPlayerId.get(player.id);
    if (!entry) {
      return fail(400, `Missing print file for player ${player.id}`);
    }
    printFiles.push({ playerId: player.id, playerName: entry.playerName, key: entry.key });
    queueAsset(entry.key, `print file (player ${player.id})`, 'print-file');
  }

  const now = options.now ?? Date.now;
  const clientRef = body.orderRef?.trim();
  const orderRef =
    clientRef && /^[a-z0-9][a-z0-9-]{5,63}$/i.test(clientRef) ? clientRef : `emblem-${submissionKey.slice(0, 8)}-${now().toString(36)}`;

  // Print-file keys participate in the fingerprint: they are the order's
  // actual production output, cached and reused across an identical retry
  // (see ProductionBuilder.tsx's printFilesRef) — if one genuinely changes
  // (a player was edited and re-approved since the last attempt), that
  // must count as materially different content, not an identical retry.
  // Sorted by playerId for determinism, independent of submission order.
  const fingerprint = options.fingerprint(
    JSON.stringify({
      email,
      paidPlayerCount,
      totalPrintQuantity,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        prints: player.prints,
        photoKey: player.photoKey,
        badgeStorageKey: player.badgeStorageKey,
      })),
      coachCard: coachCardForRpc,
      printFiles: [...printFiles].sort((a, b) => (a.playerId ?? '').localeCompare(b.playerId ?? '')),
    }),
  );

  return {
    ok: true,
    params: {
      p_submission_key: submissionKey,
      p_request_fingerprint: fingerprint,
      p_order_ref: orderRef,
      // Non-null: hasEmail already guaranteed this above, matching this
      // codebase's existing convention for the same narrowing gap (see the
      // pre-Stage-6 route.ts's own `purchaser_email: email!`).
      p_purchaser_email: email!,
      p_source: 'team_order',
      p_print_files: printFiles,
      p_club_name: body.order?.club?.trim() || null,
      p_team_name: body.contact?.team?.trim() || null,
      p_currency: priced.currency,
      p_pricing_tier: priced.tier,
      p_paid_player_count: priced.paidPlayerCount,
      p_total_print_quantity: priced.totalPrintQuantity,
      p_unit_price_pence: priced.unitPricePence,
      p_subtotal_pence: priced.subtotalPence,
      p_pricing_version: priced.pricingVersion,
      p_players: players,
      p_coach_card: coachCardForRpc,
    },
    assetsToVerify,
    observability: {
      paidPlayerCount,
      totalPrintQuantity,
      pricingTier: priced.tier,
      subtotalPence: priced.subtotalPence,
      coachCardIncluded: priced.coachCardEligible,
    },
  };
}

/**
 * Real object metadata for one key, sourced from S3 — see
 * src/lib/s3-client.ts's headObject(). Injected here (never imported
 * directly) so this module stays free of any AWS SDK dependency and stays
 * unit-testable with a fake checker, matching the `fingerprint` injection
 * pattern above.
 */
export type AssetChecker = (key: string) => Promise<{ exists: boolean; contentType?: string; contentLength?: number }>;

export interface AssetVerificationFailure {
  ok: false;
  error: string;
}
export interface AssetVerificationSuccess {
  ok: true;
}

/**
 * Confirms every asset key this submission references — every player's
 * source photo, every optional badge upload, the coach's photo, and every
 * print file — genuinely exists in storage, is the expected content type
 * for its category, and has a real, in-bounds size. Never trusts
 * `assetsToVerify` alone as proof (isValidNamespacedKey inside
 * validateOrderEnquiry already proved the namespace prefix; a client could
 * still submit a well-formed key for an object that was never actually
 * uploaded, e.g. a guessed or stale key, or one whose bytes are empty).
 * Runs with bounded concurrency — a 40-player squad submission must not
 * fire 80+ simultaneous HeadObject calls, but must not run fully serially
 * either. Must be called, and must succeed, before
 * create_authoritative_order — the RPC has no way to check S3 itself.
 */
export async function verifySubmittedAssetKeys(
  assetsToVerify: AssetToVerify[],
  checkObject: AssetChecker,
  options: { concurrency?: number } = {},
): Promise<AssetVerificationSuccess | AssetVerificationFailure> {
  const concurrency = options.concurrency ?? 5;

  let cursor = 0;
  let failure: AssetVerificationFailure | null = null;

  async function worker() {
    while (cursor < assetsToVerify.length && !failure) {
      const index = cursor;
      cursor += 1;
      const { key, label, category } = assetsToVerify[index];
      const rules = ASSET_RULES[category];
      let metadata: { exists: boolean; contentType?: string; contentLength?: number };
      try {
        metadata = await checkObject(key);
      } catch {
        // Never surface the raw AWS error (could include bucket/region/
        // credential detail) or any object metadata to a caller building a
        // client-facing message.
        failure ??= { ok: false, error: `Could not verify the uploaded file for ${label}` };
        return;
      }
      if (!metadata.exists) {
        failure ??= { ok: false, error: `Uploaded file for ${label} could not be found` };
        return;
      }
      if (!metadata.contentType || !rules.allowedContentTypes.has(metadata.contentType)) {
        failure ??= { ok: false, error: `Uploaded file for ${label} is not an allowed type` };
        return;
      }
      if (!metadata.contentLength || metadata.contentLength <= 0) {
        failure ??= { ok: false, error: `Uploaded file for ${label} is empty` };
        return;
      }
      if (metadata.contentLength > rules.maxBytes) {
        failure ??= { ok: false, error: `Uploaded file for ${label} is too large` };
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, assetsToVerify.length) }, () => worker()));

  return failure ?? { ok: true };
}
