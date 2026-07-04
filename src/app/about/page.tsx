import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          background: 'var(--accent-tint)',
          padding: '6px 12px',
          borderRadius: 999,
          display: 'inline-block',
        }}
      >
        About Emblem
      </span>

      <h1
        className="mt-6"
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 800,
          fontSize: 'clamp(36px, 6vw, 52px)',
          lineHeight: 1.05,
          letterSpacing: '-0.025em',
          color: 'var(--ink)',
          textWrap: 'balance' as 'balance',
          margin: 0,
        }}
      >
        Custom merch. You design, we chip and print.
      </h1>

      <p
        className="mt-6"
        style={{
          fontFamily: 'var(--font-manrope), system-ui',
          fontSize: 18,
          lineHeight: 1.55,
          color: 'var(--ink-soft)',
        }}
      >
        Upload one photo. We turn it into NFC-enabled trading cards, posters, wristbands, stickers
        and more. Pro quality, no studio needed.
      </p>

      <div
        className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {[
          { val: '350gsm', label: 'Print quality', sub: 'Casino-grade, premium feel' },
          { val: 'NFC', label: 'Tap-to-share', sub: 'Stats, video, socials in one tap' },
          { val: '3–5d', label: 'Shipping', sub: 'Printed and shipped from the US' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-5"
            style={{
              background: '#fff',
              boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-jbmono), monospace',
                fontWeight: 600,
                fontSize: 22,
                color: 'var(--ink)',
                letterSpacing: '0.02em',
              }}
            >
              {s.val}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--ink)',
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-manrope), system-ui',
                fontSize: 13.5,
                color: 'var(--ink-soft)',
                marginTop: 2,
              }}
            >
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <h2
        className="mt-14"
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        Why we built it
      </h2>

      <p
        className="mt-4"
        style={{
          fontFamily: 'var(--font-manrope), system-ui',
          fontSize: 16.5,
          lineHeight: 1.6,
          color: 'var(--ink-soft)',
        }}
      >
        Trading cards have been a collector format for a hundred years. Nobody had made them
        personal and connected. Every Emblem piece comes with a real NFC chip built in. Tap it
        with a phone and whatever profile, highlights, or links you've set come up instantly. We
        started with cards and kept going: posters, wristbands, stickers, keychains and more. One
        photo, every format.
      </p>

      <h2
        className="mt-12"
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        Bulk orders
      </h2>

      <p
        className="mt-4"
        style={{
          fontFamily: 'var(--font-manrope), system-ui',
          fontSize: 16.5,
          lineHeight: 1.6,
          color: 'var(--ink-soft)',
        }}
      >
        Ordering for a group? Teams, clubs, and events get bulk pricing on any product. Get in
        touch and we&apos;ll sort it out.
      </p>

      <div className="mt-12">
        <Link
          href="/builder"
          className="inline-flex items-center gap-2 rounded-2xl font-bold transition-transform active:scale-[0.98]"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            boxShadow: '0 8px 26px var(--accent-glow)',
            fontFamily: 'var(--font-manrope), system-ui',
            fontSize: 17,
            height: 56,
            padding: '0 26px',
            letterSpacing: '-0.01em',
          }}
        >
          Make yours
          <Icon name="chevR" size={18} />
        </Link>
      </div>
    </div>
  );
}
