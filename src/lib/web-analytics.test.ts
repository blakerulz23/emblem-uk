import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsUrl, webAnalyticsEnabled } from './web-analytics';

describe('Vercel Web Analytics privacy filter', () => {
  it('is off unless explicitly enabled', () => {
    expect(webAnalyticsEnabled(undefined)).toBe(false);
    expect(webAnalyticsEnabled('1')).toBe(false);
    expect(webAnalyticsEnabled('true')).toBe(true);
  });

  it('reads the flag with a literal process.env expression (required for browser inlining)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('./web-analytics.ts', import.meta.url), 'utf8');
    expect(src).toContain('= process.env.NEXT_PUBLIC_VERCEL_WEB_ANALYTICS)');
  });

  it('drops every private surface', () => {
    for (const p of ['/os', '/os?card=ABC123', '/os/settings', '/card/x', '/card-share/tok', '/player/123', '/staff/queue', '/builder-approval/tok', '/squad-invite/manage/REF', '/squad-invite/join?code=X']) {
      expect(sanitizeAnalyticsUrl(`https://emblem.cards${p}`), p).toBeNull();
    }
  });

  it('keeps marketing pages with only campaign tags and builder mode', () => {
    expect(sanitizeAnalyticsUrl('https://emblem.cards/?utm_source=google&utm_campaign=xmas&gclid=abc&email=a@b.com')).toBe(
      'https://emblem.cards/?utm_source=google&utm_campaign=xmas',
    );
    expect(sanitizeAnalyticsUrl('https://emblem.cards/builder?mode=single&step=upload&squadParticipation=uuid')).toBe('https://emblem.cards/builder?mode=single');
    expect(sanitizeAnalyticsUrl('https://emblem.cards/football-gifts-for-kids')).toBe('https://emblem.cards/football-gifts-for-kids');
  });

  it('counts the sample-data demo without its query string', () => {
    expect(sanitizeAnalyticsUrl('https://emblem.cards/os/demo?screen=card&player=x')).toBe('https://emblem.cards/os/demo');
  });

  it('drops malformed URLs and unsafe values', () => {
    expect(sanitizeAnalyticsUrl('not a url')).toBeNull();
    expect(sanitizeAnalyticsUrl('https://emblem.cards/?utm_source=Jack%20Smith')).toBe('https://emblem.cards/');
  });
});
