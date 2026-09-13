import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { shareableCustomCollectionTemplateIds } from './card-face-registry';

/**
 * The one place this codebase cannot avoid a hand-duplicated allowlist:
 * get_card_share_eligibility's own v_custom_template_ids (migration 0086)
 * cannot import card-face-registry.ts — Postgres cannot execute
 * TypeScript. This test is the drift detector the registry's own doc
 * comment promises: it parses the SQL text directly and asserts its
 * array is exactly shareableCustomCollectionTemplateIds() — so an 8th
 * Custom Collection template added to the registry without a matching
 * SQL migration (or vice versa) fails a test immediately, rather than
 * silently diverging until a real guardian hits "design_not_permitted"
 * again.
 */
const sql = readFileSync('supabase/migrations/0086_card_share_custom_collection_allowlist.sql', 'utf8');

function parseSqlTemplateIdArray(source: string): string[] {
  const match = source.match(/v_custom_template_ids text\[\] := array\[([^\]]*)\]/);
  if (!match) throw new Error('v_custom_template_ids array not found in migration 0086');
  return match[1]
    .split(',')
    .map((token) => token.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();
}

describe('get_card_share_eligibility (migration 0086) vs card-face-registry.ts — must never drift', () => {
  it('the SQL allowlist is exactly the registry\'s own shareableCustomCollectionTemplateIds()', () => {
    expect(parseSqlTemplateIdArray(sql)).toEqual(shareableCustomCollectionTemplateIds());
  });
});
