import { describe, expect, it } from 'vitest';
import { CARD_TEMPLATES } from '@/components/builder/emblem/data';
import { templates as LIVE_BUILDER_TEMPLATES } from '@/lib/emblem-uk-builder';
import {
  CARD_FACE_REGISTRY,
  getCardFaceCapability,
  templateHasApprovedBack,
  templateCanShareDesign,
  shareableCustomCollectionTemplateIds,
} from './card-face-registry';

/**
 * Table-driven coverage over every canonical template id in the
 * codebase (CARD_TEMPLATES, the same array CardArt.tsx's own dispatch
 * treats as authoritative) — not a hand-picked sample. Confirms the
 * single source of truth this PR introduces matches the audit findings
 * exactly: every id has a front mapping, and back/share/print
 * capability is correctly derived per family/id rather than guessed.
 */
describe('CARD_FACE_REGISTRY — every canonical template id', () => {
  it('has an entry for every UNIQUE id in CARD_TEMPLATES', () => {
    // Not CARD_TEMPLATES.length directly: found by this very test suite,
    // CARD_TEMPLATES itself has a pre-existing, out-of-scope-for-this-PR
    // data quality issue — 4 duplicate ids (see the dedicated test below)
    // where a "real" named procedural variant (e.g. Futuristic's own
    // "mint"/"violet" colour name) collides with the generic accent-based
    // procedural id generator using those same colour names. A Map built
    // from CARD_TEMPLATES naturally collapses those to one entry each, so
    // asserting against the raw array length would be wrong, not the
    // registry. Reported here, not silently worked around elsewhere.
    const uniqueIds = new Set(CARD_TEMPLATES.map((t) => t.id));
    expect(CARD_FACE_REGISTRY.size).toBe(uniqueIds.size);
    for (const template of CARD_TEMPLATES) {
      expect(CARD_FACE_REGISTRY.has(template.id)).toBe(true);
    }
  });

  it('KNOWN PRE-EXISTING ISSUE (not introduced by, and out of scope for, this PR): CARD_TEMPLATES contains 4 duplicate ids — a "real" named procedural variant collides with the generic accent-based procedural id generator using the same colour name. Documented here so it is never silently mistaken for something this registry caused.', () => {
    const seen = new Map<string, number>();
    for (const t of CARD_TEMPLATES) seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
    const duplicateIds = Array.from(seen.entries()).filter(([, count]) => count > 1).map(([id]) => id).sort();
    expect(duplicateIds).toEqual(['futuristic-mint', 'futuristic-violet', 'galaxy-mint', 'galaxy-violet']);
  });

  it('every entry reports a valid front mapping (hasFrontRenderer true) — CardArt.tsx always renders something for side="front"', () => {
    for (const template of CARD_TEMPLATES) {
      expect(getCardFaceCapability(template.id)?.hasFrontRenderer).toBe(true);
    }
  });

  it('unknown ids resolve to null, not a default/guessed capability', () => {
    expect(getCardFaceCapability('not-a-real-template-id')).toBeNull();
    expect(templateHasApprovedBack('not-a-real-template-id')).toBe(false);
    expect(templateCanShareDesign('not-a-real-template-id')).toBe(false);
  });

  describe('the 12 templates reachable from the live /builder wizard (emblem-uk-builder.ts) — every one has a valid back, per the audit', () => {
    it.each(LIVE_BUILDER_TEMPLATES.map((t) => t.id))('%s has hasApprovedBack: true and a non-null backAssetPath', (id) => {
      const capability = getCardFaceCapability(id);
      expect(capability).not.toBeNull();
      expect(capability!.hasApprovedBack).toBe(true);
      expect(capability!.backAssetPath).toBeTruthy();
    });
  });

  describe('sharing is scoped to Custom Collection only — Official Collection (EMJFL/Hollinwood) has never been offered sharing, and this PR does not silently widen that', () => {
    it('emjfl-official cannot share', () => {
      expect(templateCanShareDesign('emjfl-official')).toBe(false);
    });
    it.each(['hollinwood-blue', 'hollinwood-green', 'hollinwood-red', 'hollinwood-gold'])('%s cannot share', (id) => {
      expect(templateCanShareDesign(id)).toBe(false);
    });
    it.each(['custom-solar', 'custom-galaxy', 'custom-comic', 'custom-crimson', 'custom-royal', 'custom-emerald', 'custom-glacier'])(
      '%s CAN share (all seven Custom Collection templates, including the four this PR fixes)',
      (id) => {
        expect(templateCanShareDesign(id)).toBe(true);
      }
    );
  });

  describe('templates confirmed by direct audit to have NO approved back — reported, not invented', () => {
    it('vintage-classic has no approved back (CardArt.tsx has no side==="back" branch for Vintage at all — confirmed by direct code read)', () => {
      expect(templateHasApprovedBack('vintage-classic')).toBe(false);
      expect(getCardFaceCapability('vintage-classic')?.backAssetPath).toBeNull();
    });

    it('every procedural-family id (Prism/Carbon/Aurora/Clean/Spectrum/Mono) has no approved back', () => {
      const proceduralIds = CARD_TEMPLATES.filter((t) =>
        (['Prism', 'Carbon', 'Aurora', 'Clean', 'Spectrum', 'Mono'] as const).includes(t.family as 'Prism' | 'Carbon' | 'Aurora' | 'Clean' | 'Spectrum' | 'Mono')
      );
      expect(proceduralIds.length).toBeGreaterThan(0);
      for (const template of proceduralIds) {
        expect(templateHasApprovedBack(template.id)).toBe(false);
      }
    });

    it('templates with no approved back also cannot share (sharing requires both an approved design and a back to show)', () => {
      expect(templateCanShareDesign('vintage-classic')).toBe(false);
    });

    it('templates with no approved back still have a front renderer and can still print (front-only)', () => {
      const capability = getCardFaceCapability('vintage-classic');
      expect(capability?.hasFrontRenderer).toBe(true);
      expect(capability?.canPrint).toBe(true);
    });
  });

  describe('families with a real, approved back shared across every variant (not per-id, but not missing either)', () => {
    it.each(CARD_TEMPLATES.filter((t) => t.family === 'Futuristic').map((t) => t.id))('Futuristic %s has an approved (family-shared) back', (id) => {
      expect(templateHasApprovedBack(id)).toBe(true);
    });
    it.each(CARD_TEMPLATES.filter((t) => t.family === 'Galaxy').map((t) => t.id))('Galaxy Holo %s has an approved (family-shared) back', (id) => {
      expect(templateHasApprovedBack(id)).toBe(true);
    });
  });

  describe('Chrome Legacy — genuinely per-variant back asset, not shared', () => {
    const chromeIds = CARD_TEMPLATES.filter((t) => t.family === 'Chrome').map((t) => t.id);
    it('has more than one Chrome id to actually prove per-variant distinctness', () => {
      expect(chromeIds.length).toBeGreaterThan(1);
    });
    it('every Chrome id resolves to a distinct backAssetPath', () => {
      const paths = chromeIds.map((id) => getCardFaceCapability(id)!.backAssetPath);
      expect(new Set(paths).size).toBe(chromeIds.length);
    });
  });

  describe('shareableCustomCollectionTemplateIds() — the exact set migration 0086 must mirror', () => {
    it('is exactly the 7 Custom Collection ids, sorted, no Official Collection ids present', () => {
      expect(shareableCustomCollectionTemplateIds()).toEqual([
        'custom-comic', 'custom-crimson', 'custom-emerald', 'custom-galaxy', 'custom-glacier', 'custom-royal', 'custom-solar',
      ]);
    });
  });
});
