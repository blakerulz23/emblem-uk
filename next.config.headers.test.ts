import { describe, expect, it } from 'vitest';
import nextConfig from './next.config.mjs';

async function loadHeaderEntries() {
  if (!nextConfig.headers) throw new Error('next.config.mjs must export a headers() function');
  return nextConfig.headers();
}

describe('next.config.mjs headers() — Gate 1 baseline security headers', () => {
  it('applies a global security-header baseline to every route, listed before the private-route overrides', async () => {
    const entries = await loadHeaderEntries();
    expect(entries[0].source).toBe('/:path*');
    const byKey = Object.fromEntries(entries[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toContain('camera=()');

    const privateSources = entries.slice(1).map((e: { source: string }) => e.source);
    expect(privateSources).toEqual(
      expect.arrayContaining(['/review/squad-invite', '/dev/squad-invite-preview', '/squad-invite/access'])
    );
  });

  it('lets the private-route entries still win on Referrer-Policy for their exact paths (last match wins per key)', async () => {
    const entries = await loadHeaderEntries();
    const squadInvitePreview = entries.find((e: { source: string }) => e.source === '/dev/squad-invite-preview');
    if (!squadInvitePreview) throw new Error('expected a /dev/squad-invite-preview header entry');
    const byKey = Object.fromEntries(squadInvitePreview.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(byKey['Referrer-Policy']).toBe('no-referrer');
  });

  it('disables the Image Optimization API as a route-level mitigation for the unresolved Next.js 14 advisories (Gate 1 residual pass)', () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
