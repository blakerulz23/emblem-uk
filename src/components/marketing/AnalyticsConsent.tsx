'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { analyticsMeasurementId, isAnalyticsBlockedPath, readConsent, track, writeConsent, type ConsentState } from '@/lib/analytics';

/**
 * Cookie consent + GA4 loader. Renders nothing at all unless
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is configured, so shipping this component
 * changes nothing until the analytics provider is chosen.
 *
 * GA is only requested after "Accept"; IP anonymisation and Google signals
 * off. Elements marked data-track="<name>" report a cta_click on click.
 */
export default function AnalyticsConsent() {
  const id = analyticsMeasurementId();
  const pathname = usePathname() ?? '/';
  const blocked = isAnalyticsBlockedPath(pathname);
  const [consent, setConsent] = useState<ConsentState | 'unknown'>('unknown');

  useEffect(() => {
    if (id) setConsent(readConsent());
  }, [id]);

  useEffect(() => {
    if (!id || consent !== 'granted' || blocked) return;
    const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
    if (!w.gtag) {
      w.dataLayer = w.dataLayer || [];
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
      w.gtag('js', new Date());
      w.gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(s);
    }
  }, [id, consent, blocked]);

  useEffect(() => {
    if (!id) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
      if (el?.dataset.track) track('cta_click', { cta: el.dataset.track, page: window.location.pathname });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [id]);

  if (!id || blocked || consent !== null) return null;

  const choose = (state: 'granted' | 'denied') => {
    writeConsent(state);
    setConsent(state);
  };

  return (
    <div className="emh-consent" role="dialog" aria-live="polite" aria-label="Cookie choices">
      <p>
        We use optional analytics cookies to see which pages help families find Emblem. No player details are ever included.{' '}
        <Link href="/privacy">Privacy policy</Link>
      </p>
      <div className="emh-consent-actions">
        <button type="button" className="emh-consent-decline" onClick={() => choose('denied')}>Decline</button>
        <button type="button" className="emh-consent-accept" onClick={() => choose('granted')}>Accept</button>
      </div>
    </div>
  );
}
