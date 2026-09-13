import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { CUSTOM_COLLECTION_VARIANTS, CUSTOM_COLLECTION_TEMPLATE_IDS, getCustomCollectionVariant, isCustomCollectionTemplateId } from './custom-collection-manifest';

/**
 * Locks in the Galaxy position-colour correction (white, not purple — this
 * reverses an earlier purple correction from a previous pass) and its
 * scope. IMPORTANT naming note, confirmed by direct pixel sampling of both
 * variants' own background art: the `id: 'custom-solar'` entry is the
 * template whose real assets (a purple, starry, cosmic frame) and whose own
 * `accent` token (#8f5cff) match what the founder and the supplied Canva
 * reference call "Galaxy" — not the `id: 'custom-galaxy'` entry, which is a
 * visually unrelated warm orange/red frame. The `name`/`description`/
 * `theme` string fields on both entries are swapped relative to their own
 * assets (a pre-existing mismatch, out of scope here — see
 * custom-collection-manifest.ts's own comment on why it isn't fixed in this
 * pass). These tests are therefore keyed by `id` (the stable identifier
 * CardArt.tsx and stored orders actually use), with an explicit comment at
 * each assertion saying which real-world card that id corresponds to, so a
 * future reader can't repeat the mix-up this pass uncovered.
 */
function variant(id: string) {
  const v = CUSTOM_COLLECTION_VARIANTS.find((c) => c.id === id);
  if (!v) throw new Error(`variant ${id} not found`);
  return v;
}

describe('Custom Collection position colours', () => {
  it('the real "Galaxy" card (purple cosmic frame, id: custom-solar) uses white for position, not purple or red', () => {
    const galaxy = variant('custom-solar');
    expect(galaxy.positionBox?.color).toBe('#fff');
    expect(galaxy.positionBox?.color).not.toBe('#8f5cff'); // the purple it used to be (an earlier, now-reversed correction)
    expect(galaxy.positionBox?.color).not.toBe('#ef2222'); // the red it was before that
  });

  it('white matches name\'s own colour on the same card, not an arbitrary new value', () => {
    const galaxy = variant('custom-solar');
    expect(galaxy.positionBox?.color).toBe('#fff');
  });

  it('the id: custom-galaxy entry (a visually unrelated orange/red frame — NOT the purple cosmic "Galaxy" card) is untouched by this change', () => {
    const notGalaxy = variant('custom-galaxy');
    expect(notGalaxy.positionBox).toBeUndefined();
    expect(notGalaxy.accent).toBe('#f16a31'); // its own pre-existing orange accent, unchanged
  });

  it('custom-comic keeps its own pre-existing red positionBox override — unchanged, this pass only ever edited custom-solar\'s', () => {
    const comic = variant('custom-comic');
    expect(comic.positionBox?.color).toBe('#ef2222');
    expect(comic.positionBox?.color).toBe(comic.accent); // its own accent, same as before this change
  });

  it('the colour override is scoped to Galaxy (custom-solar) alone — no other entry\'s positionBox.color changed value in this pass', () => {
    // custom-solar: white (this change). custom-comic: red, its own
    // pre-existing explicit override (unchanged). custom-galaxy: no
    // override at all, falls through to its own orange accent (unchanged).
    // Any later template (custom-crimson, custom-royal, ...) that renders
    // through its own dedicated component — not the shared
    // CustomCollectionCardArt renderer this positionBox field configures —
    // correctly has no positionBox at all, so this only asserts the three
    // entries this original colour-correction pass actually touched,
    // rather than the full map (which would need editing every time an
    // unrelated later template is added).
    const colours = Object.fromEntries(
      CUSTOM_COLLECTION_VARIANTS.map((v) => [v.id, v.positionBox?.color ?? null])
    );
    expect(colours).toMatchObject({
      'custom-solar': '#fff',
      'custom-comic': '#ef2222',
      'custom-galaxy': null,
    });
  });

  it('custom-solar\'s own accent token (#8f5cff, purple) is unchanged even though position no longer uses it — accent still describes the card\'s frame/theme colour', () => {
    const galaxy = variant('custom-solar');
    expect(galaxy.accent).toBe('#8f5cff');
  });
});

describe('Hollinwood, EMJFL and the legacy basketball Galaxy family are untouched by the Custom Collection colour correction', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('Hollinwood keeps its own hardcoded red position colour (unrelated file, not touched by this colour pass — its call shape changed only in a later, separate placement pass)', () => {
    expect(cardArtSource).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#ff0000', { top: positionAnchor.top, fontSizeFactor: positionAnchor.fontSizeFactor })");
  });

  it('EMJFL keeps its own hardcoded orange-red position colour (unrelated file, not touched by this colour pass — its call shape changed only in a later, separate placement pass)', () => {
    expect(cardArtSource).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#FF4B1F', { top: positionAnchor.top, fontSizeFactor: positionAnchor.fontSizeFactor })");
  });

  it('the legacy basketball/Youthcards Galaxy family (data.ts, family: "Galaxy", horizontal-name cards) is untouched — this correction only ever changed src/lib/custom-collection-manifest.ts and src/lib/nameplate-typography.ts', () => {
    const dataSource = readFileSync(
      resolve(process.cwd(), 'src/components/builder/emblem/data.ts'),
      'utf8'
    );
    // Confirms the legacy basketball family still exists, unmodified in
    // shape, as a distinct system from the Custom Collection football
    // variants above — not a claim about its own colour values, which this
    // change never touched at all (no diff to data.ts in this PR).
    expect(dataSource).toContain("family: 'Galaxy' as Family");
  });
});

describe('Crimson (custom-crimson) manifest registration', () => {
  it('is registered with a unique, stable id distinct from every existing template', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toContain('custom-crimson');
    expect(isCustomCollectionTemplateId('custom-crimson')).toBe(true);
    const ids = CUSTOM_COLLECTION_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids across any entry
  });

  it('has the expected display name and correct runtime assets', () => {
    const crimson = getCustomCollectionVariant('custom-crimson');
    expect(crimson.id).toBe('custom-crimson');
    expect(crimson.name).toBe('Crimson');
    // preview points at the plain base.png frame art, not a composited
    // reference/demo-card image — the originally supplied reference.png
    // was removed as a runtime asset once identified as containing what
    // reads as an identifiable person (see the manifest's own comment).
    expect(crimson.assets.preview).toBe('/templates/custom-collection/crimson/base.png');
    expect(crimson.assets.preview).not.toMatch(/reference\.png$/);
    expect(crimson.assets.background).toBe('/templates/custom-collection/crimson/base.png');
    expect(crimson.assets.frameOverlay).toBe('/templates/custom-collection/crimson/frame-overlay.png');
    expect(crimson.assets.emblemLogoPosition).toBe('/templates/custom-collection/crimson/emblem-logo-position.png');
  });

  it('has a static back (assets.backBase) with no dynamic logoBox/nameBox overlay — the supplied back art bakes its own text in directly, the same fully-static shape as the Champions family\'s own back', () => {
    const crimson = getCustomCollectionVariant('custom-crimson');
    expect(crimson.assets.backBase).toBe('/templates/custom-collection/crimson/back-base.png');
    expect(crimson.back).toBeUndefined();
  });

  it('omits badgeBox/numberBox/positionBox/nameBox — its geometry is genuinely different from the shared rotated nameplate system these configure, so it renders through its own dedicated CrimsonCardArt component instead', () => {
    const crimson = getCustomCollectionVariant('custom-crimson');
    expect(crimson.badgeBox).toBeUndefined();
    expect(crimson.numberBox).toBeUndefined();
    expect(crimson.positionBox).toBeUndefined();
    expect(crimson.nameBox).toBeUndefined();
  });

  it('does not reuse or rename any existing template id', () => {
    // arrayContaining, not an exact-length equality — this only needs to
    // prove custom-crimson's own id is present and every id that existed
    // before it is still there unrenamed; it must not need editing every
    // time a later, unrelated template (e.g. custom-royal) is added.
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toEqual(
      expect.arrayContaining(['custom-solar', 'custom-galaxy', 'custom-comic', 'custom-crimson'])
    );
    expect(new Set(CUSTOM_COLLECTION_TEMPLATE_IDS).size).toBe(CUSTOM_COLLECTION_TEMPLATE_IDS.length);
  });
});

describe('CardArt.tsx dispatches custom-crimson to its own component, not the shared CustomCollectionCardArt renderer', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('imports CrimsonCardArt and dispatches custom-crimson to it before the generic Custom-family branch', () => {
    expect(cardArtSource).toContain("import CrimsonCardArt from './CrimsonCardArt'");
    expect(cardArtSource).toContain("template.family === 'Custom' && template.id === 'custom-crimson'");
    const crimsonBranchIndex = cardArtSource.indexOf("template.id === 'custom-crimson'");
    const genericCustomBranchIndex = cardArtSource.indexOf("if (template.family === 'Custom') {");
    expect(crimsonBranchIndex).toBeGreaterThan(-1);
    expect(genericCustomBranchIndex).toBeGreaterThan(-1);
    expect(crimsonBranchIndex).toBeLessThan(genericCustomBranchIndex);
  });

  it('the back-side dispatch is untouched — custom-crimson still falls through to the shared CustomCollectionCardBack (which resolves assets.backBase since no dynamic back.logoBox/nameBox is configured)', () => {
    expect(cardArtSource).toContain("side === 'back' && template.family === 'Custom'");
  });
});

describe('CrimsonCardArt renders dynamic customer data, not a fixture', () => {
  const crimsonSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CrimsonCardArt.tsx'),
    'utf8'
  );

  it('reads name/position/number/photo from the details/photo props every render, never a hardcoded fixture value', () => {
    expect(crimsonSource).toContain('d.name');
    expect(crimsonSource).toContain('d.number');
    expect(crimsonSource).toContain("positionCardLabel(d.position");
    expect(crimsonSource).toContain('{photo ?');
  });

  it('reuses the shared, already-tested nameFitScale helper for long-name/long-number shrinking rather than a new reimplementation', () => {
    expect(crimsonSource).toContain("from '@/lib/nameplate-typography'");
    expect(crimsonSource).toMatch(/nameFitScale\(/);
  });

  it('never introduces Apps, Goals or Assists', () => {
    expect(crimsonSource).not.toMatch(/\bApps\b/);
    expect(crimsonSource).not.toMatch(/\bGoals\b/);
    expect(crimsonSource).not.toMatch(/\bAssists\b/);
  });
});

describe('Crimson ships no reference/calibration-only imagery at runtime', () => {
  const crimsonAssetDir = resolve(process.cwd(), 'public/templates/custom-collection/crimson');
  const manifestSource = readFileSync(resolve(process.cwd(), 'src/lib/custom-collection-manifest.ts'), 'utf8');
  const crimsonArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/CrimsonCardArt.tsx'), 'utf8');
  const cardArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'), 'utf8');

  it('reference.png (the complete visual-reference composite, containing what reads as an identifiable person) is not present in the shipped asset directory', () => {
    expect(existsSync(`${crimsonAssetDir}/reference.png`)).toBe(false);
  });

  it('the runtime asset directory contains only the four genuine reusable layers', () => {
    const files = readdirSync(crimsonAssetDir).sort();
    expect(files).toEqual(['back-base.png', 'base.png', 'emblem-logo-position.png', 'frame-overlay.png']);
  });

  it('no source file references reference.png, or the original numbered source filenames (1.png/3.png/5.png/7.png/8.png), as a runtime asset path — prose explaining the removal may still name the file', () => {
    for (const source of [manifestSource, crimsonArtSource, cardArtSource]) {
      expect(source).not.toContain('/templates/custom-collection/crimson/reference.png');
      expect(source).not.toMatch(/crimson\/[1358]\.png|crimson\/7\.png/);
    }
  });
});

describe('Royal Edition (custom-royal) manifest registration', () => {
  it('is registered with a unique, stable id distinct from every existing template', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toContain('custom-royal');
    expect(isCustomCollectionTemplateId('custom-royal')).toBe(true);
    const ids = CUSTOM_COLLECTION_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids across any entry
  });

  it('has the expected display name and correct runtime assets', () => {
    const royal = getCustomCollectionVariant('custom-royal');
    expect(royal.id).toBe('custom-royal');
    expect(royal.name).toBe('Royal Edition');
    // preview points at the plain base.png frame art, not a composited
    // reference/demo-card image — applying the same standard established
    // for Crimson: the originally supplied 10.png/reference composite
    // contains what reads as an identifiable real child and was never
    // shipped as a runtime asset in the first place.
    expect(royal.assets.preview).toBe('/templates/custom-collection/royal/base.png');
    expect(royal.assets.preview).not.toMatch(/reference\.png$/);
    expect(royal.assets.background).toBe('/templates/custom-collection/royal/base.png');
    expect(royal.assets.frameOverlay).toBe('/templates/custom-collection/royal/frame-overlay.png');
    expect(royal.assets.emblemLogoPosition).toBe('/templates/custom-collection/royal/emblem-logo-position.png');
  });

  it('has a static back (assets.backBase) with no dynamic logoBox/nameBox overlay — same fully-static shape as Crimson\'s own back', () => {
    const royal = getCustomCollectionVariant('custom-royal');
    expect(royal.assets.backBase).toBe('/templates/custom-collection/royal/back-base.png');
    expect(royal.back).toBeUndefined();
  });

  it('omits badgeBox/numberBox/positionBox/nameBox — same reasoning as Crimson: its geometry doesn\'t match the shared rotated nameplate system these configure, so it renders through its own dedicated RoyalCardArt component instead', () => {
    const royal = getCustomCollectionVariant('custom-royal');
    expect(royal.badgeBox).toBeUndefined();
    expect(royal.numberBox).toBeUndefined();
    expect(royal.positionBox).toBeUndefined();
    expect(royal.nameBox).toBeUndefined();
  });

  it('does not reuse or rename any existing template id', () => {
    // arrayContaining, not an exact-length equality — same reasoning as
    // Crimson's own equivalent test above: must not need editing every
    // time a later, unrelated template is added.
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toEqual(
      expect.arrayContaining(['custom-solar', 'custom-galaxy', 'custom-comic', 'custom-crimson', 'custom-royal'])
    );
    expect(new Set(CUSTOM_COLLECTION_TEMPLATE_IDS).size).toBe(CUSTOM_COLLECTION_TEMPLATE_IDS.length);
  });
});

describe('CardArt.tsx dispatches custom-royal to its own component, not the shared CustomCollectionCardArt renderer', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('imports RoyalCardArt and dispatches custom-royal to it before the generic Custom-family branch', () => {
    expect(cardArtSource).toContain("import RoyalCardArt from './RoyalCardArt'");
    expect(cardArtSource).toContain("template.family === 'Custom' && template.id === 'custom-royal'");
    const royalBranchIndex = cardArtSource.indexOf("template.id === 'custom-royal'");
    const genericCustomBranchIndex = cardArtSource.indexOf("if (template.family === 'Custom') {");
    expect(royalBranchIndex).toBeGreaterThan(-1);
    expect(genericCustomBranchIndex).toBeGreaterThan(-1);
    expect(royalBranchIndex).toBeLessThan(genericCustomBranchIndex);
  });

  it('the back-side dispatch is untouched — custom-royal still falls through to the shared CustomCollectionCardBack (which resolves assets.backBase since no dynamic back.logoBox/nameBox is configured)', () => {
    expect(cardArtSource).toContain("side === 'back' && template.family === 'Custom'");
  });
});

describe('RoyalCardArt renders dynamic customer data, not a fixture', () => {
  const royalSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/RoyalCardArt.tsx'),
    'utf8'
  );

  it('reads name/position/number/photo from the details/photo props every render, never a hardcoded fixture value', () => {
    expect(royalSource).toContain('d.name');
    expect(royalSource).toContain('d.number');
    expect(royalSource).toContain("positionCardLabel(d.position");
    expect(royalSource).toContain('{photo ?');
  });

  it('reuses the shared, already-tested nameFitScale helper for long-name/long-number shrinking rather than a new reimplementation', () => {
    expect(royalSource).toContain("from '@/lib/nameplate-typography'");
    expect(royalSource).toMatch(/nameFitScale\(/);
  });

  it('never introduces Apps, Goals or Assists', () => {
    expect(royalSource).not.toMatch(/\bApps\b/);
    expect(royalSource).not.toMatch(/\bGoals\b/);
    expect(royalSource).not.toMatch(/\bAssists\b/);
  });
});

describe('Royal Edition ships no reference/calibration-only imagery at runtime', () => {
  const royalAssetDir = resolve(process.cwd(), 'public/templates/custom-collection/royal');
  const manifestSource = readFileSync(resolve(process.cwd(), 'src/lib/custom-collection-manifest.ts'), 'utf8');
  const royalArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/RoyalCardArt.tsx'), 'utf8');
  const cardArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'), 'utf8');

  it('reference.png / the complete visual-reference composite (10.png) is not present in the shipped asset directory', () => {
    expect(existsSync(`${royalAssetDir}/reference.png`)).toBe(false);
  });

  it('the example-player calibration photo is not present in the shipped asset directory', () => {
    expect(existsSync(`${royalAssetDir}/13.png`)).toBe(false);
    expect(existsSync(`${royalAssetDir}/image.png`)).toBe(false);
  });

  it('the runtime asset directory contains only the four genuine reusable layers', () => {
    const files = readdirSync(royalAssetDir).sort();
    expect(files).toEqual(['back-base.png', 'base.png', 'emblem-logo-position.png', 'frame-overlay.png']);
  });

  it('no source file references a reference/preview composite, or the original numbered source filenames, as a runtime asset path — prose explaining the design may still name the file', () => {
    for (const source of [manifestSource, royalArtSource, cardArtSource]) {
      expect(source).not.toContain('/templates/custom-collection/royal/reference.png');
      expect(source).not.toMatch(/royal\/(10|13|15|16|17)\.png/);
    }
  });
});

describe('Emerald Edition (custom-emerald) manifest registration', () => {
  it('is registered with a unique, stable id distinct from every existing template', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toContain('custom-emerald');
    expect(isCustomCollectionTemplateId('custom-emerald')).toBe(true);
    const ids = CUSTOM_COLLECTION_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the expected display name and correct runtime assets', () => {
    const emerald = getCustomCollectionVariant('custom-emerald');
    expect(emerald.id).toBe('custom-emerald');
    expect(emerald.name).toBe('Emerald Edition');
    // preview points at the plain base.png frame art — same standard as
    // Crimson/Royal: the supplied reference composite (33.png) contains
    // what reads as an identifiable real child and was never shipped.
    expect(emerald.assets.preview).toBe('/templates/custom-collection/emerald/base.png');
    expect(emerald.assets.preview).not.toMatch(/reference\.png$/);
    expect(emerald.assets.background).toBe('/templates/custom-collection/emerald/base.png');
    expect(emerald.assets.frameOverlay).toBe('/templates/custom-collection/emerald/frame-overlay.png');
    expect(emerald.assets.emblemLogoPosition).toBe('/templates/custom-collection/emerald/emblem-logo-position.png');
  });

  it('has a static back (assets.backBase) with no dynamic logoBox/nameBox overlay — same fully-static shape as Crimson/Royal\'s own backs', () => {
    const emerald = getCustomCollectionVariant('custom-emerald');
    expect(emerald.assets.backBase).toBe('/templates/custom-collection/emerald/back-base.png');
    expect(emerald.back).toBeUndefined();
  });

  it('omits badgeBox/numberBox/positionBox/nameBox — same reasoning as Crimson/Royal: renders through its own dedicated EmeraldCardArt component instead', () => {
    const emerald = getCustomCollectionVariant('custom-emerald');
    expect(emerald.badgeBox).toBeUndefined();
    expect(emerald.numberBox).toBeUndefined();
    expect(emerald.positionBox).toBeUndefined();
    expect(emerald.nameBox).toBeUndefined();
  });

  it('does not reuse or rename any existing template id', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toEqual(
      expect.arrayContaining(['custom-solar', 'custom-galaxy', 'custom-comic', 'custom-crimson', 'custom-royal', 'custom-emerald'])
    );
    expect(new Set(CUSTOM_COLLECTION_TEMPLATE_IDS).size).toBe(CUSTOM_COLLECTION_TEMPLATE_IDS.length);
  });
});

describe('CardArt.tsx dispatches custom-emerald to its own component, not the shared CustomCollectionCardArt renderer', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('imports EmeraldCardArt and dispatches custom-emerald to it before the generic Custom-family branch', () => {
    expect(cardArtSource).toContain("import EmeraldCardArt from './EmeraldCardArt'");
    expect(cardArtSource).toContain("template.family === 'Custom' && template.id === 'custom-emerald'");
    const emeraldBranchIndex = cardArtSource.indexOf("template.id === 'custom-emerald'");
    const genericCustomBranchIndex = cardArtSource.indexOf("if (template.family === 'Custom') {");
    expect(emeraldBranchIndex).toBeGreaterThan(-1);
    expect(genericCustomBranchIndex).toBeGreaterThan(-1);
    expect(emeraldBranchIndex).toBeLessThan(genericCustomBranchIndex);
  });

  it('the back-side dispatch is untouched — custom-emerald still falls through to the shared CustomCollectionCardBack', () => {
    expect(cardArtSource).toContain("side === 'back' && template.family === 'Custom'");
  });
});

describe('EmeraldCardArt renders dynamic customer data, not a fixture', () => {
  const emeraldSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/EmeraldCardArt.tsx'),
    'utf8'
  );

  it('reads name/position/number/photo from the details/photo props every render, never a hardcoded fixture value', () => {
    expect(emeraldSource).toContain('d.name');
    expect(emeraldSource).toContain('d.number');
    expect(emeraldSource).toContain("positionCardLabel(d.position");
    expect(emeraldSource).toContain('{photo ?');
  });

  it('reuses the shared, already-tested nameFitScale helper for long-name/long-number shrinking rather than a new reimplementation', () => {
    expect(emeraldSource).toContain("from '@/lib/nameplate-typography'");
    expect(emeraldSource).toMatch(/nameFitScale\(/);
  });

  it('never introduces Apps, Goals or Assists', () => {
    expect(emeraldSource).not.toMatch(/\bApps\b/);
    expect(emeraldSource).not.toMatch(/\bGoals\b/);
    expect(emeraldSource).not.toMatch(/\bAssists\b/);
  });

  it('renders name/position/number as a genuine two-tone fill+outline pair (measured from the supplied reference, not a single solid fill like Crimson/Royal)', () => {
    expect(emeraldSource).toContain('#f8e9b1');
    expect(emeraldSource).toContain('#806600');
    // both an outline span and a fill span must exist for each of the three dynamic fields
    const outlineCount = (emeraldSource.match(/aria-hidden/g) || []).length;
    expect(outlineCount).toBe(3); // number, name, position
  });
});

describe('Emerald Edition ships no reference/calibration-only imagery at runtime', () => {
  const emeraldAssetDir = resolve(process.cwd(), 'public/templates/custom-collection/emerald');
  const manifestSource = readFileSync(resolve(process.cwd(), 'src/lib/custom-collection-manifest.ts'), 'utf8');
  const emeraldArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/EmeraldCardArt.tsx'), 'utf8');
  const cardArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'), 'utf8');

  it('reference.png / the complete visual-reference composite (33.png) is not present in the shipped asset directory', () => {
    expect(existsSync(`${emeraldAssetDir}/reference.png`)).toBe(false);
  });

  it('the example-player calibration photo is not present in the shipped asset directory', () => {
    expect(existsSync(`${emeraldAssetDir}/38.png`)).toBe(false);
    expect(existsSync(`${emeraldAssetDir}/image.png`)).toBe(false);
  });

  it('the runtime asset directory contains only the four genuine reusable layers', () => {
    const files = readdirSync(emeraldAssetDir).sort();
    expect(files).toEqual(['back-base.png', 'base.png', 'emblem-logo-position.png', 'frame-overlay.png']);
  });

  it('no source file references a reference/preview composite, or the original numbered source filenames, as a runtime asset path — prose explaining the design may still name the file', () => {
    for (const source of [manifestSource, emeraldArtSource, cardArtSource]) {
      expect(source).not.toContain('/templates/custom-collection/emerald/reference.png');
      expect(source).not.toMatch(/emerald\/(33|38|36|39|40)\.png/);
    }
  });
});

describe('Glacier Edition (custom-glacier) manifest registration', () => {
  it('is registered with a unique, stable id distinct from every existing template', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toContain('custom-glacier');
    expect(isCustomCollectionTemplateId('custom-glacier')).toBe(true);
    const ids = CUSTOM_COLLECTION_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the expected display name and correct runtime assets', () => {
    const glacier = getCustomCollectionVariant('custom-glacier');
    expect(glacier.id).toBe('custom-glacier');
    expect(glacier.name).toBe('Glacier Edition');
    // preview points at the plain base.png frame art — same standard as
    // Crimson/Royal/Emerald: the supplied reference composite (21.png)
    // contains what reads as an identifiable real child and was never shipped.
    expect(glacier.assets.preview).toBe('/templates/custom-collection/glacier/base.png');
    expect(glacier.assets.preview).not.toMatch(/reference\.png$/);
    expect(glacier.assets.background).toBe('/templates/custom-collection/glacier/base.png');
    expect(glacier.assets.frameOverlay).toBe('/templates/custom-collection/glacier/frame-overlay.png');
    expect(glacier.assets.emblemLogoPosition).toBe('/templates/custom-collection/glacier/emblem-logo-position.png');
  });

  it('has a static back (assets.backBase) with no dynamic logoBox/nameBox overlay — same fully-static shape as the rest of this template family', () => {
    const glacier = getCustomCollectionVariant('custom-glacier');
    expect(glacier.assets.backBase).toBe('/templates/custom-collection/glacier/back-base.png');
    expect(glacier.back).toBeUndefined();
  });

  it('omits badgeBox/numberBox/positionBox/nameBox — renders through its own dedicated GlacierCardArt component instead', () => {
    const glacier = getCustomCollectionVariant('custom-glacier');
    expect(glacier.badgeBox).toBeUndefined();
    expect(glacier.numberBox).toBeUndefined();
    expect(glacier.positionBox).toBeUndefined();
    expect(glacier.nameBox).toBeUndefined();
  });

  it('does not reuse or rename any existing template id', () => {
    expect(CUSTOM_COLLECTION_TEMPLATE_IDS).toEqual(
      expect.arrayContaining(['custom-solar', 'custom-galaxy', 'custom-comic', 'custom-crimson', 'custom-royal', 'custom-emerald', 'custom-glacier'])
    );
    expect(new Set(CUSTOM_COLLECTION_TEMPLATE_IDS).size).toBe(CUSTOM_COLLECTION_TEMPLATE_IDS.length);
  });
});

describe('CardArt.tsx dispatches custom-glacier to its own component, not the shared CustomCollectionCardArt renderer', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('imports GlacierCardArt and dispatches custom-glacier to it before the generic Custom-family branch', () => {
    expect(cardArtSource).toContain("import GlacierCardArt from './GlacierCardArt'");
    expect(cardArtSource).toContain("template.family === 'Custom' && template.id === 'custom-glacier'");
    const glacierBranchIndex = cardArtSource.indexOf("template.id === 'custom-glacier'");
    const genericCustomBranchIndex = cardArtSource.indexOf("if (template.family === 'Custom') {");
    expect(glacierBranchIndex).toBeGreaterThan(-1);
    expect(genericCustomBranchIndex).toBeGreaterThan(-1);
    expect(glacierBranchIndex).toBeLessThan(genericCustomBranchIndex);
  });

  it('the back-side dispatch is untouched — custom-glacier still falls through to the shared CustomCollectionCardBack', () => {
    expect(cardArtSource).toContain("side === 'back' && template.family === 'Custom'");
  });
});

describe('GlacierCardArt renders dynamic customer data, not a fixture', () => {
  const glacierSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/GlacierCardArt.tsx'),
    'utf8'
  );

  it('reads name/position/number/photo from the details/photo props every render, never a hardcoded fixture value', () => {
    expect(glacierSource).toContain('d.name');
    expect(glacierSource).toContain('d.number');
    expect(glacierSource).toContain("positionCardLabel(d.position");
    expect(glacierSource).toContain('{photo ?');
  });

  it('reuses the shared, already-tested nameFitScale helper for long-name/long-number shrinking rather than a new reimplementation', () => {
    expect(glacierSource).toContain("from '@/lib/nameplate-typography'");
    expect(glacierSource).toMatch(/nameFitScale\(/);
  });

  it('never introduces Apps, Goals or Assists', () => {
    expect(glacierSource).not.toMatch(/\bApps\b/);
    expect(glacierSource).not.toMatch(/\bGoals\b/);
    expect(glacierSource).not.toMatch(/\bAssists\b/);
  });

  it('uses a plain text-shadow drop shadow, not a layered outline — genuinely different typography from Emerald\'s two-tone treatment, measured from the supplied reference', () => {
    expect(glacierSource).toContain('textShadow');
    expect(glacierSource).toContain('#c0e8ff');
    expect(glacierSource).not.toContain('aria-hidden'); // no separate outline layer needed
  });

  it('builds the arch photo-clip from the card\'s own real W/H via an SVG path, not a fixed-percentage basic-shape ellipse', () => {
    expect(glacierSource).toContain('buildArchClipPath');
    expect(glacierSource).toContain("path('M");
  });
});

describe('Glacier Edition ships no reference/calibration-only imagery at runtime', () => {
  const glacierAssetDir = resolve(process.cwd(), 'public/templates/custom-collection/glacier');
  const manifestSource = readFileSync(resolve(process.cwd(), 'src/lib/custom-collection-manifest.ts'), 'utf8');
  const glacierArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/GlacierCardArt.tsx'), 'utf8');
  const cardArtSource = readFileSync(resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'), 'utf8');

  it('reference.png / the complete visual-reference composite (21.png) is not present in the shipped asset directory', () => {
    expect(existsSync(`${glacierAssetDir}/reference.png`)).toBe(false);
  });

  it('the example-player calibration photo is not present in the shipped asset directory', () => {
    expect(existsSync(`${glacierAssetDir}/28.png`)).toBe(false);
    expect(existsSync(`${glacierAssetDir}/image.png`)).toBe(false);
  });

  it('the runtime asset directory contains only the four genuine reusable layers', () => {
    const files = readdirSync(glacierAssetDir).sort();
    expect(files).toEqual(['back-base.png', 'base.png', 'emblem-logo-position.png', 'frame-overlay.png']);
  });

  it('no source file references a reference/preview composite, or the original numbered source filenames, as a runtime asset path — prose explaining the design may still name the file', () => {
    for (const source of [manifestSource, glacierArtSource, cardArtSource]) {
      expect(source).not.toContain('/templates/custom-collection/glacier/reference.png');
      expect(source).not.toMatch(/glacier\/(21|28|25|26|27)\.png/);
    }
  });
});
