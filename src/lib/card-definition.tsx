import CardArt from '@/components/builder/emblem/CardArt';
import { CARD_TEMPLATES } from '@/components/builder/emblem/data';
import type { CardTemplate } from '@/components/builder/emblem/data';

/**
 * The platform-level Card Definition renderer (Collection OS Product
 * Specification v1.0). `CardArt` (src/components/builder/emblem/CardArt.tsx)
 * already expresses the canonical visual design — it's shared across the
 * entire Emblem builder, not owned by the football-card feature, and stays
 * exactly where it is. What this module adds is the one normalized
 * "CardFaceData" contract and the one `CardFace` component every consumer
 * renders through, so there is a single source of truth for how a face gets
 * turned into CardArt output — never a second, parallel implementation of
 * that resolution logic.
 *
 * Two things legitimately differ per consumer, and only these two:
 *  - How a CardFaceData is obtained (Builder: live wizard order/player
 *    state; Collection OS: a persisted card_definitions row).
 *  - How its photo URL is resolved (Builder: a live blob/preview URL,
 *    already resolved by the wizard; Collection OS: a freshly signed S3
 *    URL, since a player's photo is never public).
 * Everything else — layout, typography, positioning, template logic —
 * lives in exactly one place: CardArt, called from exactly one place: CardFace.
 */
export type CardFaceData = {
  templateId: string;
  sport: 'baseball' | 'basketball' | 'soccer' | 'football';
  name: string;
  number: string | null;
  team: string;
  position: string | null;
  logo: string | null;
  photoCrop: { x: number; y: number; scale: number } | null;
  stats: Record<string, string> | null;
};

/** The persisted shape (supabase's card_definitions table) — a durable S3 reference for the photo, never a URL. See migration 0019_card_definitions.sql. */
export type CardDefinitionRow = {
  id: string;
  status: 'draft' | 'approved';
  templateId: string;
  sport: CardFaceData['sport'];
  name: string;
  number: string | null;
  team: string;
  position: string | null;
  logo: string | null;
  photo: { storageKey: string; contentType?: string; crop: { x: number; y: number; scale: number }; bgRemoved: boolean } | null;
  stats: Record<string, string> | null;
};

/** Maps a persisted row to the normalized face shape CardFace renders. The photo's actual URL is resolved separately by the caller (getSignedDownloadUrl(row.photo.storageKey)) — this function never touches storage. */
export function cardDefinitionToFaceData(row: CardDefinitionRow): CardFaceData {
  return {
    templateId: row.templateId,
    sport: row.sport,
    name: row.name,
    number: row.number,
    team: row.team,
    position: row.position,
    logo: row.logo,
    photoCrop: row.photo?.crop ?? null,
    stats: row.stats,
  };
}

const templatesById = new Map<string, CardTemplate>(CARD_TEMPLATES.map((t) => [t.id, t]));
const fallbackTemplate = templatesById.get('emjfl-official') ?? CARD_TEMPLATES[0];

/** Resolves a stored template_id to its full CardTemplate — built from the same exported CARD_TEMPLATES source Builder's own internal lookup uses, so both stay in sync with zero coupling between the two call sites. */
export function resolveCardTemplate(templateId: string): CardTemplate {
  return templatesById.get(templateId) ?? fallbackTemplate;
}

/**
 * The one platform-level renderer. Builder's PlayerCard and Collection
 * OS's Card screen both render through this — neither re-implements
 * template resolution or CardArt prop assembly independently.
 */
export function CardFace({
  data,
  side,
  size,
  photoUrl,
  className,
}: {
  data: CardFaceData;
  side: 'front' | 'back';
  size: number;
  /** Already resolved by the caller — a live wizard URL in Builder, a freshly signed S3 URL in Collection OS. */
  photoUrl: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <CardArt
        template={resolveCardTemplate(data.templateId)}
        photo={photoUrl}
        details={{
          name: data.name,
          number: data.number ?? '--',
          team: data.team,
          position: data.position ?? '',
        }}
        logo={data.logo}
        stats={data.stats ?? undefined}
        sport={data.sport}
        side={side}
        size={size}
        photoScale={data.photoCrop?.scale ?? 1}
        photoOffsetX={data.photoCrop?.x ?? 0}
        photoOffsetY={data.photoCrop?.y ?? 0}
      />
    </div>
  );
}
