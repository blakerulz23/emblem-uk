import Link from 'next/link';

/**
 * Emblem homepage — compact trust & safeguarding reassurance panel.
 *
 * Sits directly after PlayerOsCollectionSection and reads as that dark
 * section's closing note, not a second hero — same dark/orange palette,
 * far less vertical padding, one short paragraph and a single CTA through
 * to the full /trust-and-safeguarding page. Plain server component: no
 * client state, no scroll listeners.
 */

const COPY = {
  eyebrow: 'TRUST & SAFEGUARDING',
  heading: 'Built around young players’ privacy',
  body:
    'Private by default. Guardian controlled. Coach contributions are verified. Emblem’s handling of children’s data is assessed through a documented Children’s DPIA.',
  cta: 'See how we protect players',
  ctaHref: '/trust-and-safeguarding',
};

function ShieldLockIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.4 5 5.9v5.3c0 4.4 2.9 7.9 7 9.1 4.1-1.2 7-4.7 7-9.1V5.9L12 3.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="9.4" y="12.1" width="5.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.4 12.1v-1.5a1.6 1.6 0 0 1 3.2 0v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function TrustSafeguardingPanel() {
  return (
    <section id="trust-safeguarding" aria-labelledby="trust-safeguarding-heading" className="tsg-panel">
      {/* Raw CSS via dangerouslySetInnerHTML, not a plain JSX text child —
          a literal quote character (Built around young players' privacy)
          inside a normal <style>{...}</style> text node gets HTML-entity-
          escaped by React's SSR serialiser and mismatches the client's raw
          DOM text, triggering a hydration error. Same pattern already used
          by PlayerOsCollectionSection.tsx and SquadInviteJourneySection.tsx. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tsg-panel { position: relative; background: linear-gradient(180deg, #100e0c 0%, #0b0b0a 100%); border-top: 1px solid rgba(255,255,255,.07); color: #F4F0E9; overflow: hidden; }
        .tsg-inner { position: relative; z-index: 1; max-width: 620px; margin: 0 auto; padding: clamp(48px,7vw,68px) 24px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .tsg-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 999px; background: rgba(255,90,31,.14); border: 1px solid rgba(255,90,31,.35); color: var(--accent, #ff5a1f); margin: 0 0 18px; }
        .tsg-eyebrow { display: flex; align-items: center; gap: 9px; font-family: var(--font-jbmono), monospace; font-weight: 700; letter-spacing: .22em; font-size: 12px; color: var(--accent, #ff5a1f); margin: 0 0 14px; text-transform: uppercase; }
        .tsg-eyebrow::before, .tsg-eyebrow::after { content: ''; width: 16px; height: 1px; background: rgba(255,90,31,.4); }
        .tsg-heading { font-family: var(--font-sora), system-ui, sans-serif; font-weight: 800; font-size: clamp(26px,3.4vw,34px); line-height: 1.12; letter-spacing: -0.01em; margin: 0 0 14px; color: #F7F3EC; text-wrap: balance; }
        .tsg-body { font-family: var(--font-manrope), system-ui, sans-serif; font-size: 15.5px; line-height: 1.65; color: #B4AC9F; margin: 0 0 26px; max-width: 52ch; }
        .tsg-cta { min-height: 46px; padding: 12px 24px; transition: background 160ms ease, box-shadow 160ms ease, transform 80ms ease; }
        .tsg-cta:hover { background: #ff6e28; }
        .tsg-cta:focus-visible { outline: 3px solid #fff; outline-offset: 3px; box-shadow: 0 0 0 6px rgba(255,90,31,.4); }
        .tsg-cta:active { background: #d9540f; transform: translateY(1px); box-shadow: 0 8px 20px -8px rgba(241,96,29,.5); }

        @media (prefers-reduced-motion: reduce) {
          .tsg-panel * { transition: none !important; }
        }

        @media (max-width: 480px) {
          .tsg-inner { padding: 44px 20px 52px; }
          .tsg-body { max-width: none; }
        }
      `,
        }}
      />

      <div className="tsg-inner">
        <span className="tsg-icon">
          <ShieldLockIcon />
        </span>
        <p className="tsg-eyebrow">{COPY.eyebrow}</p>
        <h2 id="trust-safeguarding-heading" className="tsg-heading">
          {COPY.heading}
        </h2>
        <p className="tsg-body">{COPY.body}</p>
        <Link className="emh-btn emh-btn-primary tsg-cta" href={COPY.ctaHref}>
          {COPY.cta}
        </Link>
      </div>
    </section>
  );
}
