import type { SkillCategoryId } from './playerProfile';

/**
 * Position-aware weighting for rolling category scores up into one overall
 * player score. These weights are prototype values for a single position
 * (midfielder) — a real implementation should make this configurable per
 * age group and position (e.g. a goalkeeper would weight Physical/Mental
 * far higher than Attacking), rather than hardcoding one weight set.
 */
export type PositionWeights = Record<SkillCategoryId, number>;

export const MIDFIELDER_WEIGHTS: PositionWeights = {
  technical: 0.3,
  tactical: 0.25,
  mental: 0.2,
  attacking: 0.15,
  physical: 0.1,
};

/**
 * Rolls per-category scores up into one overall score using position-aware
 * weights, rounded to the nearest whole number. Weights don't need to sum to
 * 1 — they're normalized here — but MIDFIELDER_WEIGHTS above already does.
 */
export function computeOverallScore(
  categoryScores: Partial<Record<SkillCategoryId, number>>,
  weights: PositionWeights
): number {
  const entries = Object.entries(weights) as [SkillCategoryId, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight === 0) return 0;
  const weighted = entries.reduce((sum, [id, w]) => sum + (categoryScores[id] ?? 0) * w, 0);
  return Math.round(weighted / totalWeight);
}
