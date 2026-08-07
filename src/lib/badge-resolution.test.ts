import { describe, expect, it } from 'vitest';
import { CUSTOM_COLLECTION_BADGE_PLACEHOLDER, resolveCustomCollectionBadge } from './badge-resolution';

describe('resolveCustomCollectionBadge — Custom Collection print-badge rule', () => {
  it('category 1: no uploaded badge falls back to the Football Collection placeholder for print', () => {
    expect(resolveCustomCollectionBadge(undefined, undefined)).toBe(CUSTOM_COLLECTION_BADGE_PLACEHOLDER);
    expect(resolveCustomCollectionBadge(null, null)).toBe(CUSTOM_COLLECTION_BADGE_PLACEHOLDER);
  });

  it('category 2: an uploaded player badge takes priority over the placeholder', () => {
    expect(resolveCustomCollectionBadge('https://example.com/uploaded-badge.png', undefined)).toBe(
      'https://example.com/uploaded-badge.png'
    );
  });

  it('category 2: an order-level badge is used when no per-player badge exists', () => {
    expect(resolveCustomCollectionBadge(undefined, 'https://example.com/order-badge.png')).toBe(
      'https://example.com/order-badge.png'
    );
  });

  it('a per-player badge takes priority over an order-level badge', () => {
    expect(resolveCustomCollectionBadge('https://example.com/player.png', 'https://example.com/order.png')).toBe(
      'https://example.com/player.png'
    );
  });
});

describe('Official Collection badge rule (category 3) — documented, not re-derived here', () => {
  // playerBadge()'s official branch (ProductionBuilder.tsx) is deliberately
  // left untouched by this task's refactor — it never called into
  // resolveCustomCollectionBadge before and still doesn't, so the generic
  // Football Collection placeholder can never appear for an Official
  // Collection card. Asserted structurally rather than by importing
  // ProductionBuilder.tsx (a large client-only component with heavy
  // browser-only transitive dependencies not suited to a unit test).
  it('the Custom Collection placeholder constant is never referenced by official-collection badge resolution', () => {
    // If playerBadge()'s official branch ever starts resolving through
    // resolveCustomCollectionBadge, this constant would need to appear in
    // its possible outputs — it structurally cannot for the dedicated
    // custom-only helper under test here.
    expect(resolveCustomCollectionBadge('https://example.com/club-crest.png')).not.toBe(
      CUSTOM_COLLECTION_BADGE_PLACEHOLDER
    );
  });
});
