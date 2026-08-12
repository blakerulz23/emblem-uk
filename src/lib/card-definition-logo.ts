import { getSignedDownloadUrl } from './s3-client';

/**
 * Stage 6 asset-integrity amendment — how to interpret card_definitions.logo
 * (a plain `text` column; see migration 0019_card_definitions.sql).
 * Deliberately its own small server-only file, never imported by card-
 * definition.tsx itself: that file is imported by client components
 * (ProductionBuilder.tsx's CardFace), and this module pulls in
 * s3-client.ts's AWS SDK dependency — keeping them separate keeps that out
 * of the client bundle entirely.
 *
 * Three shapes can appear in this column:
 *  - null: no badge.
 *  - a JSON-encoded { storageKey, source: 'upload' } object: a genuinely
 *    private, customer-uploaded badge (see migration 0048's
 *    create_authoritative_order) — must be freshly signed at read time,
 *    exactly like every other private asset reference in this codebase
 *    (players.photo_key, card_definitions.photo.storageKey), never
 *    rendered from the stored value directly.
 *  - any other plain string: either a static, permanently-public app asset
 *    path (an EMJFL club crest, or the generic Custom Collection
 *    placeholder — see getEmjflClub/resolveCustomCollectionBadge in the
 *    builder), or a legacy row written before this fix (which may be an
 *    already-expired presigned S3 URL — a pre-existing, now-frozen
 *    limitation for rows written before this change; not backfilled, per
 *    "no historical row is rewritten"). Either way, rendered as-is with no
 *    signing attempted — a plain string was never a storage key.
 */
export async function resolveCardDefinitionLogo(raw: string | null | undefined, expiresInSec?: number): Promise<string | null> {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — a legacy or static-asset plain URL string. Render as-is.
    return raw;
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    (parsed as Record<string, unknown>).source === 'upload' &&
    typeof (parsed as Record<string, unknown>).storageKey === 'string'
  ) {
    try {
      return await getSignedDownloadUrl((parsed as { storageKey: string }).storageKey, expiresInSec);
    } catch (err) {
      // Missing/inaccessible object — drop the badge rather than render a
      // broken image or throw and take down the whole page.
      console.error('resolveCardDefinitionLogo: could not sign badge URL', err instanceof Error ? err.message : err);
      return null;
    }
  }

  // Parsed as valid JSON but not our expected shape — nothing in this
  // codebase has ever written arbitrary JSON here before this change, so
  // this should not occur; never render raw JSON text as an <img src>.
  return null;
}
