'use client';

import { usePathname } from 'next/navigation';
import { configuredSiteUrls } from '@/lib/geo-routing';

const COUNTRIES = [
  { id: 'uk', flag: '🇬🇧', name: 'United Kingdom' },
  { id: 'ca', flag: '🇨🇦', name: 'Canada' },
  { id: 'us', flag: '🇺🇸', name: 'United States' },
] as const;

/**
 * Footer country picker for the three Emblem sites (UK / Canada / US).
 * Hidden until all three addresses are configured (see lib/geo-routing.ts).
 */
export default function CountrySwitcher() {
  const pathname = usePathname() || '/';
  if (!configuredSiteUrls()) return null;
  return (
    <nav aria-label="Country" className="emh-footer-country" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13, marginTop: 10 }}>
      {COUNTRIES.map((c) =>
        c.id === 'uk' ? (
          <span key={c.id} aria-current="true" style={{ fontWeight: 700 }}>{c.flag} {c.name}</span>
        ) : (
          <a key={c.id} href={`/api/country?to=${c.id}&next=${encodeURIComponent(pathname)}`} style={{ opacity: 0.7 }}>
            {c.flag} {c.name}
          </a>
        )
      )}
    </nav>
  );
}
