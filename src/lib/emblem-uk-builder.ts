import { clubBadgePath } from '@/lib/emjfl-clubs';
import { CUSTOM_COLLECTION_VARIANTS, type CustomCollectionTemplateId } from '@/lib/custom-collection-manifest';
import { HOLLINWOOD_VARIANTS, type HollinwoodTemplateId } from '@/lib/hollinwood-manifest';
import type { PricingQuoteResponse } from '@/lib/pricing-quote';

export type OrderType = 'single' | 'set' | 'squad';
export type CollectionType = 'official' | 'custom';
export type Sport = 'football';
export type PlayerStatus = 'approved' | 'needs-photo' | 'needs-details' | 'ready';
export type TemplateId = 'emjfl-official' | HollinwoodTemplateId | CustomCollectionTemplateId;

// Guided builder flow. `approve` is a team-only gate (siblings/squad — more
// than one card genuinely benefits from a review-and-approve pass before the
// final order screen); single-player orders skip straight from Personalise
// to Review, keeping the flow to 6 steps as specified.
export type StepId = 'order-type' | 'collection' | 'upload' | 'bg-removal' | 'personalise' | 'approve' | 'review';

export const STEP_LABEL: Record<StepId, string> = {
  'order-type': 'Choose order type',
  collection: 'Choose collection',
  upload: 'Upload photos',
  'bg-removal': 'Remove background',
  personalise: 'Personalise cards',
  approve: 'Approve cards',
  review: 'Review order',
};

export function stepsFor(orderType: OrderType): StepId[] {
  const base: StepId[] = ['order-type', 'collection', 'upload', 'bg-removal', 'personalise'];
  return orderType === 'single' ? [...base, 'review'] : [...base, 'approve', 'review'];
}

export type CropTransform = {
  x: number;
  y: number;
  scale: number;
};

export type PhotoAsset = {
  srcUrl: string;
  hiResUrl?: string;
  storageKey?: string;
  storageUrl?: string;
  contentType?: string;
  uploadedAt?: string;
  crop: CropTransform;
  bgRemoved: boolean;
  fileName?: string;
};

export type PlayerDraft = {
  id: string;
  name: string;
  club?: string;
  badgeUrl?: string;
  badgeStorageKey?: string;
  emjflClubId?: string;
  clubEdited?: boolean;
  position: string;
  kitNo: string;
  stats: Record<string, string>;
  photo?: PhotoAsset;
  templateId?: TemplateId;
  prints: number;
  approvedAt?: string;
  updatedAt: string;
};

export type OrderDraft = {
  id: string;
  type: OrderType;
  collectionType: CollectionType;
  collectionName?: string;
  sport: Sport;
  club: string;
  ageGroup: string;
  season: string;
  league?: string;
  badgeUrl?: string;
  emjflClubId?: string;
  templateDefault: TemplateId;
  players: PlayerDraft[];
};

export type TemplateConfig = {
  id: TemplateId;
  name: string;
  description: string;
  accent: string;
  background: string;
  frameAsset?: string;
};

export const templates: TemplateConfig[] = [
  {
    id: 'emjfl-official',
    name: 'Orange',
    description: 'Official EMJFL orange football frame with real front and back artwork',
    accent: '#dc5b24',
    background: '#15110d',
    frameAsset: '/templates/emjfl/background.png',
  },
  ...HOLLINWOOD_VARIANTS.map((variant) => ({
    id: variant.id,
    name: variant.name,
    description: variant.description,
    accent: variant.accent,
    background: variant.background,
    frameAsset: variant.assets.frontBase,
  })),
  ...CUSTOM_COLLECTION_VARIANTS.map((variant) => ({
    id: variant.id,
    name: variant.name,
    description: variant.description,
    accent: variant.accent,
    background: variant.background,
    frameAsset: variant.assets.preview,
  })),
];

export const DEFAULT_CUSTOM_TEMPLATE_ID: CustomCollectionTemplateId = CUSTOM_COLLECTION_VARIANTS[0].id;

export const sportConfig = {
  football: {
    label: 'Football',
    disabled: false,
    positions: ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'],
    stats: [
      { key: 'apps', label: 'Apps' },
      { key: 'goals', label: 'Goals' },
      { key: 'assists', label: 'Assists' },
    ],
  },
} satisfies Record<Sport, { label: string; disabled: boolean; positions: string[]; stats: Array<{ key: string; label: string }> }>;

export const statusCopy: Record<PlayerStatus, string> = {
  approved: 'Ready for production',
  'needs-photo': 'Needs photo',
  'needs-details': 'Needs details',
  ready: 'Ready',
};

export const nowIso = () => new Date().toISOString();

export function createPlayer(seed?: Partial<PlayerDraft>): PlayerDraft {
  return {
    id: seed?.id || crypto.randomUUID(),
    name: seed?.name || '',
    club: seed?.club,
    badgeUrl: seed?.badgeUrl,
    badgeStorageKey: seed?.badgeStorageKey,
    emjflClubId: seed?.emjflClubId,
    clubEdited: seed?.clubEdited,
    position: seed?.position || '',
    kitNo: seed?.kitNo || '',
    stats: seed?.stats || { apps: '', goals: '', assists: '' },
    photo: seed?.photo,
    templateId: seed?.templateId,
    prints: seed?.prints || 1,
    approvedAt: seed?.approvedAt,
    updatedAt: seed?.updatedAt || nowIso(),
  };
}

// Custom Collection is the default for every new order (Official remains a
// fully valid, manually-selected alternative) — this shape mirrors exactly
// what selectCollection('custom') in ProductionBuilder produces when
// switching from a blank official state, so downstream logic that branches
// on collectionType (template validity, club/badge fallbacks, production
// payload) sees the same consistent state it already handles today.
export function defaultOrder(): OrderDraft {
  return {
    id: 'emblem-local-order',
    type: 'single',
    collectionType: 'custom',
    collectionName: 'Custom Collection',
    sport: 'football',
    club: '',
    ageGroup: '',
    season: '2026/27',
    league: undefined,
    emjflClubId: undefined,
    templateDefault: DEFAULT_CUSTOM_TEMPLATE_ID,
    players: [
      createPlayer({
        id: 'emblem-player-1',
        club: '',
        emjflClubId: undefined,
        clubEdited: false,
        stats: { apps: '', goals: '', assists: '' },
      }),
    ],
  };
}

export function isPlayerDirty(player: PlayerDraft) {
  if (!player.approvedAt) return false;
  return new Date(player.updatedAt).getTime() > new Date(player.approvedAt).getTime();
}

export function derivePlayerStatus(player: PlayerDraft): PlayerStatus {
  if (player.approvedAt && !isPlayerDirty(player)) return 'approved';
  if (!player.photo?.srcUrl) return 'needs-photo';
  if (!player.name.trim() || !player.position.trim() || !player.kitNo.trim()) return 'needs-details';
  return 'ready';
}

/**
 * Distinct approved (paid) players and their combined print quantity —
 * exactly the two inputs POST /api/pricing/quote accepts
 * (paidPlayerCount/totalPrintQuantity). This module deliberately computes
 * nothing else pricing-related: no tier, no unit price, no subtotal. Those
 * are authoritative-only, calculated exclusively by src/lib/pricing-
 * engine.ts on the server and fetched via that endpoint — see
 * src/components/emblem-uk/useOrderPricingQuote.ts. This file previously
 * had its own client-side priceForApprovedCount() tier/price model (a
 * pre-Stage-4 relic — different thresholds and prices from the approved
 * engine, never reconciled with it); it has been removed rather than kept
 * as a fallback, since silently falling back to a different, wrong price
 * is worse than showing a loading/error state.
 */
export function summarizeOrder(order: OrderDraft) {
  const counts = order.players.reduce(
    (acc, player) => {
      const status = derivePlayerStatus(player);
      acc[status] += 1;
      return acc;
    },
    { approved: 0, 'needs-photo': 0, 'needs-details': 0, ready: 0 } as Record<PlayerStatus, number>,
  );
  const approvedPlayers = order.players.filter((player) => derivePlayerStatus(player) === 'approved');
  const approvedPrints = approvedPlayers.reduce((sum, player) => sum + player.prints, 0);

  return {
    counts,
    approvedPlayers,
    approvedPrints,
    checkoutEligible: approvedPlayers.length >= 1,
  };
}

export function selectedTemplate(order: OrderDraft, player?: PlayerDraft) {
  return templates.find((template) => template.id === (player?.templateId || order.templateDefault)) || templates[0];
}

/**
 * Explicit, required (not optional-defaulted) parameter — the caller must
 * decide what quote applies, this function never reaches into React state
 * or falls back to a stale/default price on its own. Pass `null` only when
 * there is genuinely no authoritative quote to attach yet (e.g. the one
 * remaining internal/debug export path, exportPayload() in
 * ProductionBuilder.tsx, which isn't wired to the public submit flow); the
 * real enquiry-submission call site must only ever pass a quote whose
 * counts have already been confirmed fresh — see
 * ProductionBuilder.tsx's submitEnquiry()/canSendEnquiry.
 */
export function productionPayload(order: OrderDraft, quote: PricingQuoteResponse | null) {
  const summary = summarizeOrder(order);
  const fallbackClub = order.collectionType === 'custom' ? 'Custom Collection' : order.club;
  const players = summary.approvedPlayers.map((player) => ({
    id: player.id,
    name: player.name,
    club: player.club || order.club || fallbackClub,
    badgeUrl: player.badgeUrl,
    badgeStorageKey: player.badgeStorageKey,
    badgeSnapshotUrl: player.badgeUrl || (order.collectionType === 'official' ? clubBadgePath(player.emjflClubId || order.emjflClubId) : order.badgeUrl),
    emjflClubId: player.emjflClubId || order.emjflClubId,
    position: player.position,
    kitNo: player.kitNo,
    stats: player.stats,
    prints: player.prints,
    templateId: player.templateId || order.templateDefault,
    photo: player.photo,
    approvedAt: player.approvedAt,
  }));
  const clubGroups = Array.from(players.reduce((groups, player) => {
    const key = player.emjflClubId || player.club;
    const existing = groups.get(key);
    if (existing) {
      existing.players.push(player.id);
      existing.prints += player.prints;
      return groups;
    }
    groups.set(key, {
      id: key,
      club: player.club,
      badgeUrl: player.badgeUrl,
      badgeStorageKey: player.badgeStorageKey,
      badgeSnapshotUrl: player.badgeSnapshotUrl,
      players: [player.id],
      prints: player.prints,
    });
    return groups;
  }, new Map<string, { id: string; club: string; badgeUrl?: string; badgeStorageKey?: string; badgeSnapshotUrl?: string; players: string[]; prints: number }>()).values());

  return {
    order: {
      id: order.id,
      type: order.type,
      collectionType: order.collectionType,
      collectionName: order.collectionName,
      sport: order.sport,
      club: order.club || fallbackClub,
      ageGroup: order.ageGroup,
      season: order.season,
      league: order.league,
      badgeUrl: order.badgeUrl,
      badgeSnapshotUrl: order.badgeUrl || (order.collectionType === 'official' ? clubBadgePath(order.emjflClubId) : undefined),
      emjflClubId: order.emjflClubId,
      templateDefault: order.templateDefault,
    },
    // One order-level block, copied field-for-field from the authoritative
    // quote — never recalculated, never converted (pence stays pence), and
    // never allocated across clubGroups/players below. Omitted entirely
    // (not a zeroed/placeholder block) when no quote was passed, so a
    // reader can never mistake "no quote" for "a £0 quote".
    ...(quote
      ? {
          pricing: {
            currency: quote.currency,
            pricingTier: quote.pricingTier,
            paidPlayerCount: quote.paidPlayerCount,
            totalPrintQuantity: quote.totalPrintQuantity,
            unitPricePence: quote.unitPricePence,
            subtotalPence: quote.subtotalPence,
            pricingVersion: quote.pricingVersion,
            coachCardIncluded: quote.coachCardIncluded,
            lineItems: quote.lineItems,
            deliveryPence: quote.deliveryPence,
            taxPence: quote.taxPence,
            totalPence: quote.totalPence,
          },
        }
      : {}),
    clubGroups,
    players,
  };
}
