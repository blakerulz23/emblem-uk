import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { STEP_LABEL, stepsFor } from './emblem-uk-builder';

/**
 * Photo-first direct builder (adapted from Emblem Canada). The direct
 * journey opens on the photo and drops the old "who are you building for?"
 * screen; guardian verification (adult-permission, after review) and the
 * Squad Invite four-step journey are unchanged.
 */
describe('photo-first step order', () => {
  it('one player: photo → background → collection → personalise → review → permission (6 steps, was 7)', () => {
    expect(stepsFor('single')).toEqual(['upload', 'bg-removal', 'collection', 'personalise', 'review', 'adult-permission']);
  });

  it('team and set orders keep the approve gate: 7 steps, was 8', () => {
    for (const type of ['squad', 'set'] as const) {
      expect(stepsFor(type)).toEqual(['upload', 'bg-removal', 'collection', 'personalise', 'approve', 'review', 'adult-permission']);
    }
  });

  it('the photo always comes first and adult permission always comes last', () => {
    for (const type of ['single', 'squad', 'set'] as const) {
      const steps = stepsFor(type);
      expect(steps[0]).toBe('upload');
      expect(steps[steps.length - 1]).toBe('adult-permission');
      expect(steps.indexOf('review')).toBe(steps.length - 2);
    }
  });

  it('every step has a label and there is no order-type step any more', () => {
    for (const type of ['single', 'squad', 'set'] as const) for (const step of stepsFor(type)) expect(STEP_LABEL[step]).toBeTruthy();
    expect(Object.keys(STEP_LABEL)).not.toContain('order-type');
  });

  it('Squad Invite keeps its own fixed four steps, untouched', () => {
    const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
    expect(builder).toContain("const SQUAD_INVITE_STEP_ORDER: StepId[] = ['upload', 'bg-removal', 'personalise', 'review']");
  });
});
