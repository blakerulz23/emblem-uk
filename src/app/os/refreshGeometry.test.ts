import { describe, expect, it } from 'vitest';
import { applyResistance, OS_REFRESH_THRESHOLD } from './refreshGeometry';

describe('applyResistance — pull-to-refresh resistance curve', () => {
  it('an upward or zero drag never produces a positive pull distance', () => {
    expect(applyResistance(-50)).toBe(0);
    expect(applyResistance(0)).toBe(0);
  });

  it('tracks the finger 1:1 within the free zone (no resistance yet)', () => {
    expect(applyResistance(10)).toBe(10);
    expect(applyResistance(24)).toBe(24);
  });

  it('applies diminishing resistance once past the free zone — visual distance grows slower than raw drag distance', () => {
    const at50 = applyResistance(50);
    const at100 = applyResistance(100);
    expect(at50).toBeGreaterThan(24);
    expect(at50).toBeLessThan(50);
    // Not one-to-one indefinitely: doubling the raw pull well past the free
    // zone must not double the visual distance.
    expect(at100).toBeLessThan(at50 * 2);
  });

  it('never exceeds the maximum visual pull distance, however far the raw drag goes', () => {
    expect(applyResistance(500)).toBeLessThanOrEqual(applyResistance(10_000));
    expect(applyResistance(10_000)).toBe(applyResistance(5_000)); // both clamped to the same cap
  });

  it('a realistic release-at-threshold drag lands convincingly past the activation threshold, not right at its edge', () => {
    // A user who intends to trigger a refresh typically drags noticeably
    // further than the bare minimum — confirms the threshold is reachable
    // with normal, restrained resistance rather than requiring an
    // unreasonably long raw drag.
    const raw = 130;
    expect(applyResistance(raw)).toBeGreaterThan(OS_REFRESH_THRESHOLD);
  });
});
