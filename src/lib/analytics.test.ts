import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vercelTrack = vi.fn();
vi.mock('@vercel/analytics', () => ({ track: (...args: unknown[]) => vercelTrack(...args) }));

import { track, vercelEventProperties, VERCEL_EVENT_PROPERTIES, type AnalyticsEvent } from './analytics';

function stubWindow(path: string, consent: string | null = null) {
  const gtag = vi.fn();
  vi.stubGlobal('window', {
    location: { pathname: path },
    localStorage: { getItem: () => consent, setItem: () => undefined },
    gtag,
  });
  return gtag;
}

beforeEach(() => {
  vercelTrack.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Vercel custom event properties (Pro plan: max 2 per event)', () => {
  it('never declares more than 2 properties for any event', () => {
    for (const [event, keys] of Object.entries(VERCEL_EVENT_PROPERTIES)) {
      expect(keys.length, event).toBeLessThanOrEqual(2);
    }
  });

  it('sends only the declared properties, already sanitized', () => {
    expect(vercelEventProperties('cta_click', { cta: 'hero_build', page: '/', tier: 'single' })).toEqual({ cta: 'hero_build', page: '/' });
    expect(vercelEventProperties('builder_step', { step: 'upload', mode: 'single' })).toEqual({ step: 'upload', mode: 'single' });
    expect(vercelEventProperties('checkout_handoff', { mode: 'single', page: '/builder' })).toEqual({ mode: 'single' });
  });
});

describe('track()', () => {
  it('sends each event once to Vercel when Web Analytics is enabled, with no consent needed (cookieless)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
    const gtag = stubWindow('/', null);
    track('cta_click', { cta: 'explore_build', page: '/' });
    expect(vercelTrack).toHaveBeenCalledTimes(1);
    expect(vercelTrack).toHaveBeenCalledWith('cta_click', { cta: 'explore_build', page: '/' });
    expect(gtag).not.toHaveBeenCalled();
  });

  it('tracks the redesigned homepage event names unchanged', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
    stubWindow('/');
    for (const cta of ['hero_build', 'hero_try_app', 'hero_design_royal', 'hero_design_glacier', 'explore_build', 'explore_faq', 'explore__os_demo', 'pricing_single', 'trust_more', 'gift_promo']) {
      track('cta_click', { cta, page: '/' });
    }
    expect(vercelTrack.mock.calls.map((c) => (c[1] as { cta: string }).cta)).toEqual([
      'hero_build', 'hero_try_app', 'hero_design_royal', 'hero_design_glacier', 'explore_build', 'explore_faq', 'explore__os_demo', 'pricing_single', 'trust_more', 'gift_promo',
    ]);
  });

  it('sends nothing to Vercel while Web Analytics is off', () => {
    stubWindow('/');
    track('builder_step', { step: 'upload', mode: 'single' });
    expect(vercelTrack).not.toHaveBeenCalled();
  });

  it('never reports from private surfaces', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
    for (const path of ['/os', '/card/abc', '/card-share/tok', '/player/1', '/staff/queue', '/builder-approval/tok']) {
      stubWindow(path);
      track('cta_click', { cta: 'x', page: path });
    }
    expect(vercelTrack).not.toHaveBeenCalled();
  });

  it('drops unsafe values before they reach Vercel', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
    stubWindow('/builder');
    track('builder_step', { step: 'Jack Smith <jack@example.com>', mode: 'single', email: 'a@b.com' } as Record<string, unknown>);
    expect(vercelTrack).toHaveBeenCalledWith('builder_step', { mode: 'single' });
  });

  it('only reaches GA with a measurement id and granted consent, and then once', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_WEB_ANALYTICS', 'true');
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST1234');
    const denied = stubWindow('/', 'denied');
    track('checkout_handoff', { mode: 'single' });
    expect(denied).not.toHaveBeenCalled();
    const granted = stubWindow('/', 'granted');
    track('checkout_handoff', { mode: 'single' });
    expect(granted).toHaveBeenCalledTimes(1);
    expect(vercelTrack).toHaveBeenCalledTimes(2);
  });

  it('covers every event type', () => {
    const events: AnalyticsEvent[] = ['cta_click', 'builder_step', 'builder_started', 'card_completed', 'checkout_handoff', 'faq_open'];
    expect(Object.keys(VERCEL_EVENT_PROPERTIES).sort()).toEqual([...events].sort());
  });
});
