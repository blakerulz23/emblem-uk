import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/os/screens/Profile.tsx', 'utf8');

/**
 * Profile.tsx is a 'use client' component (useState/useOsData), so it
 * can't be rendered in this repo's jsdom-free test environment — same
 * reasoning as ConditionalChrome-contract.test.ts. This proves the
 * legacy-position compatibility logic by reading the source directly.
 *
 * Why this matters: the Position select shows a *resolved* value for a
 * legacy player (stored "CB" displays as "Defender" — see
 * resolveCanonicalPosition), so saveIdentity must compare the current
 * selection against that same resolution of the stored value to decide
 * whether the guardian actually changed it — a raw string comparison
 * against the legacy code would look "changed" on every single save
 * (since "Defender" !== "CB") and silently rewrite a historical position
 * value the guardian never touched, just by saving an unrelated field
 * like their favourite player.
 */
describe('Profile.tsx — saveIdentity never silently rewrites an untouched legacy position', () => {
  it('initialises the position <select> from a resolved value, not the raw stored one', () => {
    expect(source).toContain("useState(resolveCanonicalPosition(playerProfile.position) ?? '')");
  });

  it('computes whether the position is unchanged by resolving the stored value the same way the initial state did', () => {
    expect(source).toContain('resolveCanonicalPosition(playerProfile.position) ?? \'\'');
    const idx = source.indexOf('positionUnchanged');
    expect(idx).toBeGreaterThan(-1);
  });

  it('only builds the position PATCH request when the position actually changed', () => {
    const idx = source.indexOf('const positionRequest');
    const line = source.slice(idx, source.indexOf(';', source.indexOf('fetch', idx)));
    expect(line).toContain('trimmedPosition');
    expect(line).toContain('!positionUnchanged');
  });

  it('the identity PATCH (favouritePlayer/footballAmbition) never includes position at all — it is always a separate request', () => {
    const idx = source.indexOf('const identityRequest');
    const line = source.slice(idx, source.indexOf(');', idx));
    expect(line).not.toContain('position');
  });
});
