import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

/**
 * The back of every card is that template's own static, approved design
 * (card-face-registry.ts) — never customer-editable, per every back's own
 * design comment (e.g. CrimsonCardArt.tsx's static EMBLEM.CARDS back).
 * Before this PR, flipping the personalise step's preview to "Back" left
 * the photo zoom/horizontal/vertical crop sliders and the full
 * name/number/position/photo/badge PlayerEditor fully visible and live —
 * all of which only ever affect the FRONT design, confirmed by direct
 * audit. This file proves the fix structurally (no jsdom in this repo's
 * vitest setup — see other *-contract.test.ts files for the same
 * convention): the crop controls and PlayerEditor are both gated on
 * cardSide === 'front', and a read-only note is shown instead on the back.
 */
describe('ProductionBuilder personalise step — photo/framing/text controls are hidden while viewing the back', () => {
  it('the crop controls (.uk-crop-controls) / upload prompt (.uk-photo-needed) only render when cardSide === "front"', () => {
    const idx = builder.indexOf("{cardSide === 'front' ? (");
    expect(idx).toBeGreaterThan(-1);
    const section = builder.slice(idx, builder.indexOf("This is the back of your card", idx));
    expect(section).toContain('uk-crop-controls');
    expect(section).toContain('uk-photo-needed');
  });

  it('a read-only note is shown instead while viewing the back — appears exactly once, after the (single) cardSide ternary that gates the crop controls, and before PlayerEditor', () => {
    const ternaryIdx = builder.indexOf("{cardSide === 'front' ? (");
    const noteIdx = builder.indexOf('This is the back of your card — nothing to edit here.');
    const playerEditorIdx = builder.indexOf('<PlayerEditor order={order}');
    expect(ternaryIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(ternaryIdx);
    expect(playerEditorIdx).toBeGreaterThan(noteIdx);
    // Only one such ternary exists in the whole file — the note is
    // unambiguously this ternary's own else branch, not some unrelated
    // later block.
    expect(builder.indexOf("{cardSide === 'front' ? (", ternaryIdx + 1)).toBe(-1);
  });

  it('PlayerEditor (name/number/position/photo/badge) only renders when cardSide === "front"', () => {
    const idx = builder.indexOf('{cardSide === \'front\' && (\n                <PlayerEditor');
    expect(idx).toBeGreaterThan(-1);
  });

  it('the Front/Back toggle itself is never hidden — always available regardless of which side is showing', () => {
    const idx = builder.indexOf('<div className="uk-card-side-toggle wide" aria-label="Choose card side">');
    expect(idx).toBeGreaterThan(-1);
    // Not wrapped in its own cardSide conditional — appears unconditionally
    // right after the front/back-specific content block.
    const precedingLines = builder.slice(Math.max(0, idx - 40), idx);
    expect(precedingLines).not.toMatch(/\{cardSide === 'front' && \($/);
  });

  it('flipping cardSide never mutates player/order state — setCardSide is a pure UI state setter, called with no other side effects', () => {
    const matches = builder.match(/onClick=\{\(\) => setCardSide\('(front|back)'\)\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const call of matches) {
      expect(call).not.toMatch(/patchPlayer|patchOrder|assignPhoto/);
    }
  });
});
