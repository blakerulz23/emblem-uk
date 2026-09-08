import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/ConditionalChrome.tsx', 'utf8');

/**
 * ConditionalChrome is a 'use client' component (usePathname), so it can't
 * be rendered in this repo's jsdom-free test environment — same reasoning
 * as ShareCardSheet.tsx's own contract tests. This proves the routing
 * logic itself by reading the source.
 *
 * /card-share/[token] (migration 0085's public share page) reuses
 * .emh-btn/.emh-eyebrow for its redesigned CTA/label, which only resolve
 * to the real marketing typeface (Manrope/Sora) once this route is inside
 * the marketing shell — see that page's own contract test for the visual
 * side of this change.
 */
describe('ConditionalChrome — /card-share/[token] gets marketing typography without changing which chrome branch it renders in', () => {
  it('matches /card-share/ by prefix, since usePathname() returns the real token, never the literal route pattern', () => {
    expect(source).toContain("const isCardSharePublicPage = (pathname: string) => pathname.startsWith('/card-share/');");
  });

  it('isMarketing includes the card-share public page alongside the exact-match MARKETING_ROUTES list', () => {
    const idx = source.indexOf('const isMarketing');
    const line = source.slice(idx, source.indexOf(';', idx));
    expect(line).toContain('MARKETING_ROUTES.includes(pathname)');
    expect(line).toContain('isCardSharePublicPage(pathname)');
  });

  it('card-share does not match any of the special no-chrome/own-chrome branches (builder/os/player-profile/home) — it still falls through to the ordinary Navbar+Footer branch, unchanged', () => {
    // isBuilder/isOs/isPlayerProfile/isHome are all computed from fixed
    // prefixes/exact paths that a /card-share/<token> URL can never match;
    // proven here by confirming none of those checks reference '/card-share'.
    const guardSection = source.slice(source.indexOf('const isBuilder'), source.indexOf('const isMarketing'));
    expect(guardSection).not.toContain('/card-share');
  });
});
