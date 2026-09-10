import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CUSTOM_COLLECTION_VARIANTS } from './custom-collection-manifest';

/**
 * Locks in the Galaxy position-colour correction (purple, not red) and its
 * scope. IMPORTANT naming note, confirmed by direct pixel sampling of both
 * variants' own background art before making this change: the `id:
 * 'custom-solar'` entry is the template whose real assets (a purple, starry,
 * cosmic frame) and whose own `accent` token (#8f5cff) match what the
 * founder and the supplied Canva reference call "Galaxy" — not the `id:
 * 'custom-galaxy'` entry, which is a visually unrelated warm orange/red
 * frame. The `name`/`description`/`theme` string fields on both entries are
 * swapped relative to their own assets (a pre-existing mismatch, out of
 * scope here — see custom-collection-manifest.ts's own comment on why it
 * isn't fixed in this pass). These tests are therefore keyed by `id` (the
 * stable identifier CardArt.tsx and stored orders actually use), with an
 * explicit comment at each assertion saying which real-world card that id
 * corresponds to, so a future reader can't repeat the mix-up this pass
 * uncovered.
 */
function variant(id: string) {
  const v = CUSTOM_COLLECTION_VARIANTS.find((c) => c.id === id);
  if (!v) throw new Error(`variant ${id} not found`);
  return v;
}

describe('Custom Collection position colours', () => {
  it('the real "Galaxy" card (purple cosmic frame, id: custom-solar) uses purple for position, not red', () => {
    const galaxy = variant('custom-solar');
    expect(galaxy.positionBox?.color).toBe('#8f5cff');
    expect(galaxy.positionBox?.color).not.toBe('#ef2222'); // the red it used to be
  });

  it("the purple is the variant's own existing accent token, not an invented colour", () => {
    const galaxy = variant('custom-solar');
    expect(galaxy.positionBox?.color).toBe(galaxy.accent);
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
    // custom-solar: purple (this change). custom-comic: red, its own
    // pre-existing explicit override (unchanged). custom-galaxy: no
    // override at all, falls through to its own orange accent (unchanged).
    const colours = Object.fromEntries(
      CUSTOM_COLLECTION_VARIANTS.map((v) => [v.id, v.positionBox?.color ?? null])
    );
    expect(colours).toEqual({
      'custom-solar': '#8f5cff',
      'custom-comic': '#ef2222',
      'custom-galaxy': null,
    });
  });
});

describe('Hollinwood, EMJFL and the legacy basketball Galaxy family are untouched by the Custom Collection colour correction', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  it('Hollinwood keeps its own hardcoded red position colour (unrelated file, not touched this pass)', () => {
    expect(cardArtSource).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#ff0000', positionAnchor)");
  });

  it('EMJFL keeps its own hardcoded orange-red position colour (unrelated file, not touched this pass)', () => {
    expect(cardArtSource).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#FF4B1F', positionAnchor)");
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
