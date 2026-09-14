import { CARD_TEMPLATES, type CardTemplate, type Family } from '@/components/builder/emblem/data';
import { getCustomCollectionVariant, isCustomCollectionTemplateId } from '@/lib/custom-collection-manifest';
import { getHollinwoodVariant, isHollinwoodTemplateId } from '@/lib/hollinwood-manifest';

/**
 * The single source of truth for "what can this template's front/back
 * actually do" — builder (Front/Back toggle), customer review, the public
 * share page, and the printer-PDF pipeline all read this instead of each
 * re-deriving its own answer. Built by audit (see PR description) of
 * CardArt.tsx's own side==='back' dispatch, cross-checked against every
 * family's real manifest/asset data — never a second, hand-typed list of
 * template ids that could drift from either.
 *
 * Two things this module deliberately does NOT own:
 *  - "Is this order allowed to actually share/print right now" — that's an
 *    authorization decision (guardian identity, order/card state), not a
 *    template capability, and stays server-side in
 *    get_card_share_eligibility (Supabase). This module only answers
 *    "does this DESIGN have a shareable/printable back at all" — the
 *    input `canShareDesign` is checked against, never a replacement for.
 *  - CardArt.tsx's own rendering — this module is read BY CardArt.tsx (see
 *    its side==='back' guard) to decide whether to attempt a family/id's
 *    back branch at all, not a second copy of what that branch renders.
 */

export type CardFaceCapability = {
  id: string;
  family: Family;
  /** Every id in CARD_TEMPLATES has a real front renderer by construction
   *  (CardArt.tsx always falls through to *something* for side='front') —
   *  kept as an explicit field rather than assumed so a future capability
   *  consumer never has to special-case "well, front is always true". */
  hasFrontRenderer: true;
  /** Whether a genuine, already-approved back design exists for this
   *  template — never true because a back COULD be built, only because
   *  CardArt.tsx already has a matching side==='back' branch backed by a
   *  real asset. Vintage and every procedural (Prism/Carbon/Aurora/Clean/
   *  Spectrum/Mono, and the accent-only Futuristic/Chrome/Galaxy
   *  variants with no real PNG asset) are false — CardArt.tsx has no
   *  side==='back' branch for them at all, so requesting one used to
   *  silently re-render the front. Confirmed by direct code + asset audit,
   *  not assumed. */
  hasApprovedBack: boolean;
  /** Literal path to the back asset this template's own back branch
   *  actually resolves to today — for tests/debugging only, not itself a
   *  rendering decision (CardArt.tsx's own branches still own that). Null
   *  when hasApprovedBack is false. */
  backAssetPath: string | null;
  /** Business policy, not a technical capability: only Custom Collection
   *  designs are currently approved for guardian sharing (see
   *  get_card_share_eligibility's own v_custom_template_ids, migration
   *  0086) — Official Collection (EMJFL/Hollinwood) has never been
   *  offered sharing. Requires hasApprovedBack too, since the share page
   *  now shows both faces (see card-share-public-page.ts). */
  canShareDesign: boolean;
  /** Every template can be printed front-only; a second (back) page is
   *  only ever added when hasApprovedBack is true (see pdf-generator.ts's
   *  own optional backImageDataUrl) — printing itself is never gated by
   *  family/id, only by whether front/back images were actually captured. */
  canPrint: true;
};

/** Families where CardArt.tsx's side==='back' dispatch has no real branch
 *  at all — confirmed by reading every `side === 'back' &&` condition in
 *  CardArt.tsx directly, not inferred. Every family NOT listed here either
 *  has its own family-level branch (Futuristic/Galaxy/Chrome/Champions/
 *  EMJFL/Hollinwood) or is checked per-id below (Custom). */
const FAMILIES_WITHOUT_BACK: ReadonlySet<Family> = new Set<Family>([
  'Vintage', 'Prism', 'Carbon', 'Aurora', 'Clean', 'Spectrum', 'Mono',
]);

/** Literal back-asset paths for the families whose back is one shared
 *  design across every variant (not per-id) — copied from CardArt.tsx's
 *  own RealCardBack/RealGalaxyBack/EmjflCardBack literals, for reference/
 *  test purposes only. Chrome and Hollinwood are per-id instead (see
 *  backAssetPathFor below) and Custom is fully per-id via its own
 *  manifest. */
const FAMILY_SHARED_BACK_ASSET: Partial<Record<Family, string>> = {
  Futuristic: '/templates/futuristic-back/background.png',
  Galaxy: '/templates/galaxy-holo/back/01_back_background_texture.png',
  Champions: '/templates/champions/back.png',
  EMJFL: '/templates/emjfl/back-background.png',
};

function hasApprovedBack(template: CardTemplate): boolean {
  if (template.family === 'Custom') {
    if (!isCustomCollectionTemplateId(template.id)) return false;
    const variant = getCustomCollectionVariant(template.id);
    return Boolean(variant.back?.base || variant.assets.backBase);
  }
  if (template.family === 'Hollinwood') {
    if (!isHollinwoodTemplateId(template.id)) return false;
    return Boolean(getHollinwoodVariant(template.id).assets.backBase);
  }
  if (FAMILIES_WITHOUT_BACK.has(template.family)) return false;
  // Futuristic / Chrome / Galaxy / Champions / EMJFL — every id in these
  // families shares (or, for Chrome, derives) a real approved back; see
  // CardArt.tsx's own RealCardBack/RealChromeBack/RealGalaxyBack/inline-
  // Champions/EmjflCardBack branches, all unconditional on id within the
  // family.
  return true;
}

function backAssetPathFor(template: CardTemplate): string | null {
  if (!hasApprovedBack(template)) return null;
  if (template.family === 'Custom' && isCustomCollectionTemplateId(template.id)) {
    const variant = getCustomCollectionVariant(template.id);
    return variant.back?.base || variant.assets.backBase || null;
  }
  if (template.family === 'Hollinwood' && isHollinwoodTemplateId(template.id)) {
    return getHollinwoodVariant(template.id).assets.backBase;
  }
  if (template.family === 'Chrome') {
    // RealChromeBack: `/templates/chrome-legacy/back/variants/back-base-${variantName}.png`
    // where variantName strips the family prefix from the id.
    const variantName = template.id.replace('chrome-legacy-', '');
    return `/templates/chrome-legacy/back/variants/back-base-${variantName}.png`;
  }
  return FAMILY_SHARED_BACK_ASSET[template.family] ?? null;
}

function canShareDesign(template: CardTemplate): boolean {
  return template.family === 'Custom' && isCustomCollectionTemplateId(template.id) && hasApprovedBack(template);
}

function capabilityFor(template: CardTemplate): CardFaceCapability {
  return {
    id: template.id,
    family: template.family,
    hasFrontRenderer: true,
    hasApprovedBack: hasApprovedBack(template),
    backAssetPath: backAssetPathFor(template),
    canShareDesign: canShareDesign(template),
    canPrint: true,
  };
}

/** Keyed by template id — built once at module load from CARD_TEMPLATES,
 *  the same array every renderer already treats as canonical. */
export const CARD_FACE_REGISTRY: ReadonlyMap<string, CardFaceCapability> = new Map(
  CARD_TEMPLATES.map((template) => [template.id, capabilityFor(template)])
);

export function getCardFaceCapability(templateId: string): CardFaceCapability | null {
  return CARD_FACE_REGISTRY.get(templateId) ?? null;
}

export function templateHasApprovedBack(templateId: string): boolean {
  return getCardFaceCapability(templateId)?.hasApprovedBack ?? false;
}

export function templateCanShareDesign(templateId: string): boolean {
  return getCardFaceCapability(templateId)?.canShareDesign ?? false;
}

/** The exact set this module asserts get_card_share_eligibility's own
 *  v_custom_template_ids (migration 0086) must equal — read by
 *  migration-0086-share-registry-parity.test.ts so the SQL allowlist
 *  (which cannot import this file directly — Postgres cannot execute
 *  TypeScript) can never silently drift from this registry without a
 *  test failing. */
export function shareableCustomCollectionTemplateIds(): string[] {
  return CARD_TEMPLATES.filter((t) => canShareDesign(t)).map((t) => t.id).sort();
}
