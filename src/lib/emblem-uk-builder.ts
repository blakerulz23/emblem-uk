import { clubBadgePath, EAST_MANCHESTER_LEAGUE, preferredTemplateForClub } from '@/lib/emjfl-clubs';
import { HOLLINWOOD_VARIANTS, type HollinwoodTemplateId } from '@/lib/hollinwood-manifest';

export type OrderType = 'single' | 'set' | 'squad';
export type Sport = 'football';
export type PlayerStatus = 'approved' | 'needs-photo' | 'needs-details' | 'ready';
export type TemplateId = 'emjfl-official' | HollinwoodTemplateId;

export type CropTransform = {
  x: number;
  y: number;
  scale: number;
};

export type PhotoAsset = {
  srcUrl: string;
  hiResUrl?: string;
  crop: CropTransform;
  bgRemoved: boolean;
  fileName?: string;
};

export type PlayerDraft = {
  id: string;
  name: string;
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
];

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

export function defaultOrder(): OrderDraft {
  return {
    id: 'emblem-local-order',
    type: 'single',
    sport: 'football',
    club: 'Curzon Ashton Juniors',
    ageGroup: '',
    season: '2026/27',
    league: EAST_MANCHESTER_LEAGUE,
    emjflClubId: 'curzon-ashton',
    templateDefault: preferredTemplateForClub('curzon-ashton') as TemplateId,
    players: [
      createPlayer({
        id: 'emblem-player-1',
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

export function priceForApprovedCount(approvedPlayers: number) {
  if (approvedPlayers >= 16) return { perCard: 9.5, label: 'Squad+ pricing' };
  if (approvedPlayers >= 7) return { perCard: 11, label: 'Squad pricing' };
  if (approvedPlayers >= 2) return { perCard: 12.99, label: 'Set pricing' };
  return { perCard: 14.99, label: 'Single pricing' };
}

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
  const pricing = priceForApprovedCount(approvedPlayers.length);

  return {
    counts,
    approvedPlayers,
    approvedPrints,
    pricing,
    subtotal: approvedPrints * pricing.perCard,
    checkoutEligible: approvedPlayers.length >= 1,
  };
}

export function selectedTemplate(order: OrderDraft, player?: PlayerDraft) {
  return templates.find((template) => template.id === (player?.templateId || order.templateDefault)) || templates[0];
}

export function productionPayload(order: OrderDraft) {
  const summary = summarizeOrder(order);
  return {
    order: {
      id: order.id,
      type: order.type,
      sport: order.sport,
      club: order.club,
      ageGroup: order.ageGroup,
      season: order.season,
      league: order.league,
      badgeUrl: order.badgeUrl,
      badgeSnapshotUrl: order.badgeUrl || clubBadgePath(order.emjflClubId),
      emjflClubId: order.emjflClubId,
      templateDefault: order.templateDefault,
    },
    pricing: {
      label: summary.pricing.label,
      perCard: summary.pricing.perCard,
      approvedPrints: summary.approvedPrints,
      subtotal: Number(summary.subtotal.toFixed(2)),
    },
    players: summary.approvedPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      kitNo: player.kitNo,
      stats: player.stats,
      prints: player.prints,
      templateId: player.templateId || order.templateDefault,
      photo: player.photo,
      approvedAt: player.approvedAt,
    })),
  };
}
