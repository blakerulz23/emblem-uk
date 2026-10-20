import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

const vercelTrack = vi.fn();
vi.mock('@vercel/analytics', () => ({ track: (...args: unknown[]) => vercelTrack(...args) }));

import { ANALYTICS_MODES, ANALYTICS_SOURCES, referrerSource, sanitizeEventParams, setAnalyticsOptOut, track, analyticsObjected, isAnalyticsBlockedPath } from './analytics';
import { sanitizeAnalyticsUrl } from './web-analytics';

function browser(path: string, opts: { optOut?: boolean; gpc?: boolean } = {}) {
  const store = new Map<string, string>(opts.optOut ? [['emblem_analytics_off', '1']] : []);
  vi.stubGlobal('window', {
    location: { pathname: path },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    dispatchEvent: () => true,
  });
  vi.stubGlobal('navigator', { globalPrivacyControl: Boolean(opts.gpc) });
  return store;
}

beforeEach(() => {
  vercelTrack.mockClear();
  vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('builder_started / card_completed: fixed vocabulary only', () => {
  it('sends builder_started with only mode and a source category', () => {
    browser('/builder');
    track('builder_started', { mode: 'single', source: 'search' });
    expect(vercelTrack).toHaveBeenCalledWith('builder_started', { mode: 'single', source: 'search' });
  });

  it('sends card_completed with only the mode', () => {
    browser('/builder');
    track('card_completed', { mode: 'squad_invite', source: 'social', step: 'review' });
    expect(vercelTrack).toHaveBeenCalledWith('card_completed', { mode: 'squad_invite' });
  });

  it('drops any mode or source outside the fixed lists, and any personal-looking value', () => {
    expect(sanitizeEventParams({ mode: 'Riley Hart', source: 'https://google.com/search?q=riley' })).toEqual({});
    expect(sanitizeEventParams({ mode: 'single', source: 'newsletter' })).toEqual({ mode: 'single' });
    expect(sanitizeEventParams({ name: 'Riley', email: 'p@example.com', photo: 'blob:x', code: '123456', orderRef: 'emblem-1' })).toEqual({});
    for (const m of ANALYTICS_MODES) expect(sanitizeEventParams({ mode: m })).toEqual({ mode: m });
    for (const s of ANALYTICS_SOURCES) expect(sanitizeEventParams({ source: s })).toEqual({ source: s });
  });

  it('referrerSource returns a category, never the URL', () => {
    expect(referrerSource('', 'emblem.cards')).toBe('direct');
    expect(referrerSource('https://www.google.co.uk/search?q=riley+hart', 'emblem.cards')).toBe('search');
    expect(referrerSource('https://l.facebook.com/l.php?u=x', 'emblem.cards')).toBe('social');
    expect(referrerSource('https://www.instagram.com/', 'emblem.cards')).toBe('social');
    expect(referrerSource('https://emblem.cards/faq', 'emblem.cards')).toBe('emblem');
    expect(referrerSource('https://some-club.co.uk/news', 'emblem.cards')).toBe('other');
    expect(referrerSource('not a url', 'emblem.cards')).toBe('other');
  });
});

describe('objection (PECR statistical exception: simple, free way to object)', () => {
  it('a visitor who turned analytics off sends no events', () => {
    browser('/builder', { optOut: true });
    track('builder_started', { mode: 'single', source: 'direct' });
    expect(vercelTrack).not.toHaveBeenCalled();
  });

  it('Global Privacy Control is honoured as an objection', () => {
    browser('/builder', { gpc: true });
    expect(analyticsObjected()).toBe(true);
    track('card_completed', { mode: 'single' });
    expect(vercelTrack).not.toHaveBeenCalled();
  });

  it('turning it off and back on takes effect immediately and is remembered on the device only', () => {
    const store = browser('/builder');
    setAnalyticsOptOut(true);
    expect(store.get('emblem_analytics_off')).toBe('1');
    track('builder_step', { step: 'upload', mode: 'single' });
    expect(vercelTrack).not.toHaveBeenCalled();
    setAnalyticsOptOut(false);
    expect(store.has('emblem_analytics_off')).toBe(false);
    track('builder_step', { step: 'upload', mode: 'single' });
    expect(vercelTrack).toHaveBeenCalledTimes(1);
  });

  it('page views are not loaded for an objecting visitor, and are re-checked before every send', () => {
    const src = readFileSync('src/components/marketing/VercelWebAnalytics.tsx', 'utf8');
    expect(src).toMatch(/if \(!webAnalyticsEnabled\(\) \|\| !allowed\) return null;/);
    expect(src).toMatch(/beforeSend=\{\(event\) => \{\s*if \(analyticsObjected\(\)\) return null;/);
  });
});

describe('route exclusions (page views and events share one rule)', () => {
  it('allows the public Squad Invite landing page only', () => {
    expect(isAnalyticsBlockedPath('/squad-invite/start')).toBe(false);
    expect(sanitizeAnalyticsUrl('https://emblem.cards/squad-invite/start?utm_source=club&ref=abc')).toBe('https://emblem.cards/squad-invite/start?utm_source=club');
  });

  it('keeps every private, guardian, staff and internal route excluded', () => {
    for (const p of ['/squad-invite', '/squad-invite/join', '/squad-invite/pay', '/squad-invite/access', '/squad-invite/manage/ABC123', '/squad-invite/start/extra',
      '/os', '/os/anything', '/card/abc', '/card-share/tok', '/card-setup-preview', '/player/p1', '/staff/queue', '/staff/reports/weekly',
      '/builder-approval/tok', '/review/squad-invite', '/dev/photo-crop-test', '/test-print']) {
      expect(isAnalyticsBlockedPath(p), p).toBe(true);
      expect(sanitizeAnalyticsUrl(`https://emblem.cards${p}`), p).toBeNull();
    }
  });

  it('events are not sent from an excluded page', () => {
    browser('/squad-invite/join');
    track('cta_click', { cta: 'x', page: '/squad-invite/join' });
    browser('/staff/queue');
    track('builder_step', { step: 'upload', mode: 'single' });
    expect(vercelTrack).not.toHaveBeenCalled();
  });

  it('the payment recovery page reports only /builder (its query is dropped)', () => {
    expect(sanitizeAnalyticsUrl('https://emblem.cards/builder?pay=1')).toBe('https://emblem.cards/builder');
  });
});

describe('builder wiring', () => {
  const b = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
  it('builder_started fires once, on the first photo, with only the mode and a source category', () => {
    expect(b).toMatch(/track\('builder_started', \{ mode: analyticsMode, source: referrerSource\(document\.referrer, window\.location\.host\) \}\);/);
    expect(b).toMatch(/if \(builderStartedRef\.current\) return;\s*builderStartedRef\.current = true;/);
    expect(b).toMatch(/if \(!file\) return;\s*noteBuilderStarted\(\);/);
    expect(b).toMatch(/if \(imageFiles\.length === 0\) return;\s*noteBuilderStarted\(\);/);
  });
  it('card_completed fires once, on reaching review with a completed card, with only the mode', () => {
    expect(b).toMatch(/track\('card_completed', \{ mode: analyticsMode \}\);/);
    expect(b).toMatch(/if \(cardCompletedRef\.current \|\| activeStepId !== 'review' \|\| !cardIsComplete\) return;/);
    expect(b).toMatch(/const analyticsMode = squadInviteContext \? 'squad_invite' : order\.type;/);
  });
  it('no analytics call in the builder passes player, photo, email or order data', () => {
    const calls = b.match(/track\('[a-z_]+', \{[^}]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) expect(c).not.toMatch(/name|photo|email|enquiry|player\.|orderRef|submission|code/i);
  });
});
