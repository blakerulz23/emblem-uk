import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import { pageOpenGraph } from '@/lib/marketing/site';

const DESCRIPTION =
  'Emblem makes personalised football cards for UK grassroots players: printed in the UK, with a chip that opens a private player profile their family controls.';

export const metadata: Metadata = {
  title: 'About Emblem | Personalised Football Cards for Grassroots Players',
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: pageOpenGraph({ title: 'About Emblem', description: DESCRIPTION, url: '/about' }),
};

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
          textWrap: 'balance' as const,
          margin: 0,
        }}
      >
        Every young footballer deserves their own card.
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
        Emblem makes personalised football cards for UK grassroots players. Upload one photo and
        we print a premium card with their name, number and club. Tap it with a phone and it opens
        a private player profile their family controls.
      </p>

      <div
        className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {[
          { val: 'Premium', label: 'Print quality', sub: 'A personalised football card' },
          { val: 'NFC', label: 'Tap to open', sub: 'Their private player profile' },
          { val: 'UK', label: 'Made to order', sub: 'Printed in the UK, free UK delivery' },
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
        Grassroots football is full of moments worth keeping: a first goal, a big save, the season
        a nervous player found their feet. Pro players get their own cards. We wanted every
        grassroots player to have one too, with a private profile where their family keeps the
        season&apos;s moments and achievements. Parents and guardians decide who sees it.
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
        Teams and clubs
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
        Ordering for a whole squad? Orders of 10 or more cards get squad pricing and a free coach
        card. Or send families one private link so each creates their own child&apos;s card.{' '}
        <Link href="/football-cards-for-clubs" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          Cards for clubs
        </Link>
      </p>

      <div className="mt-12">
        <Link
          href="/builder?mode=single"
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
          Build their card
          <Icon name="chevR" size={18} />
        </Link>
      </div>
    </div>
  );
}
