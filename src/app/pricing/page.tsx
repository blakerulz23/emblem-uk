import Link from 'next/link';
import { PRODUCTS, SIZES } from '@/components/builder/emblem/data';
import Icon from '@/components/builder/emblem/Icon';

export default function PricingPage() {
  if (process.env.NEXT_PUBLIC_VARIANT === 'cards') {
    const TIERS = [
      { qty: '1 card',     price: 24,  blurb: 'Try it solo. One custom NFC trading card.', popular: false },
      { qty: '2 cards',    price: 40,  blurb: 'Save $4. Great for siblings or duplicates.', popular: false },
      { qty: '10 cards',   price: 100, blurb: 'Save $140. The fan favorite.',               popular: true  },
      { qty: '10 players', price: 600, blurb: 'Full team package. 10 different players.',   popular: false },
    ];
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-tint)', padding: '6px 12px', borderRadius: 999, display: 'inline-block' }}>
            Simple pricing
          </span>
          <h1 className="mt-6" style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 'clamp(36px, 6vw, 52px)', lineHeight: 1.05, letterSpacing: '-0.025em', color: 'var(--ink)', margin: 0 }}>
            Trading cards, your way.
          </h1>
          <p className="mt-5" style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 17, lineHeight: 1.5, color: 'var(--ink-soft)' }}>
            Every order ships with NFC programming and free reprints included. Bulk discounts kick in at 10.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {TIERS.map((t) => (
            <div key={t.qty} className="rounded-3xl p-6 sm:p-7 relative overflow-hidden" style={{ background: t.popular ? 'var(--ink)' : '#fff', color: t.popular ? '#fff' : 'var(--ink)', boxShadow: t.popular ? '0 18px 40px rgba(11,11,15,0.22)' : 'inset 0 0 0 1px var(--line), 0 4px 14px rgba(0,0,0,0.04)' }}>
              {t.popular && (
                <span style={{ position: 'absolute', top: 16, right: 16, fontFamily: 'var(--font-jbmono), monospace', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(255,90,31,0.18)', padding: '4px 9px', borderRadius: 999 }}>
                  Most popular
                </span>
              )}
              <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.popular ? 'rgba(255,255,255,0.7)' : 'var(--ink-faint)' }}>
                {t.qty}
              </div>
              <div className="mt-3" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 44, letterSpacing: '-0.03em', lineHeight: 1 }}>${t.price}</span>
                <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: t.popular ? 'rgba(255,255,255,0.6)' : 'var(--ink-faint)' }}>USD</span>
              </div>
              <p className="mt-4" style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14.5, lineHeight: 1.5, color: t.popular ? 'rgba(255,255,255,0.78)' : 'var(--ink-soft)' }}>
                {t.blurb}
              </p>
              <Link href="/builder" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 24, padding: '10px 16px', borderRadius: 999, fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', textDecoration: 'none', background: t.popular ? '#fff' : 'var(--ink)', color: t.popular ? 'var(--ink)' : '#fff' }}>
                Start designing <Icon name="chevR" size={16} />
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl p-7 sm:p-9" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Two sizes
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              <h3 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: 0 }}>Credit Card Size</h3>
              <p className="mt-2" style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>
                Standard wallet size. Same dimensions as your driver's license. Fits in any card sleeve.
              </p>
            </div>
            <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              <h3 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: 0 }}>Sports Card Size</h3>
              <p className="mt-2" style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>
                Collector size — 2.5" × 3.5", just like the cards you grew up trading.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center max-w-2xl mx-auto" style={{ padding: '40px 24px', borderRadius: 28, background: 'var(--ink)', color: '#fff' }}>
          <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', margin: 0 }}>
            Bulk order or a custom ask?
          </h2>
          <p className="mt-4" style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 16, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)' }}>
            League packs, sponsor co-brands, larger team rosters — we'll quote anything. We usually reply within a few hours.
          </p>
          <a href="mailto:hello@emblem.cards" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24, padding: '14px 22px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
            Contact us
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <div className="text-center max-w-2xl mx-auto">
        <span
          style={{
            fontFamily: 'var(--font-jbmono), monospace',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'var(--accent)', background: 'var(--accent-tint)',
            padding: '6px 12px', borderRadius: 999, display: 'inline-block',
          }}
        >
          Simple, per-product pricing
        </span>
        <h1
          className="mt-6"
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
            fontSize: 'clamp(36px, 6vw, 52px)', lineHeight: 1.05, letterSpacing: '-0.025em',
            color: 'var(--ink)', textWrap: 'balance' as 'balance', margin: 0,
          }}
        >
          Premium gear, fair prices.
        </h1>
        <p
          className="mt-5"
          style={{
            fontFamily: 'var(--font-manrope), system-ui', fontSize: 17, lineHeight: 1.5,
            color: 'var(--ink-soft)',
          }}
        >
          NFC programming and free reprints are always included. Bulk and league pricing available.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {PRODUCTS.map((p, i) => {
          const sizes = SIZES[p.id] || ['One size'];
          const isHero = i === 0;
          return (
            <div
              key={p.id}
              className="rounded-3xl p-6 sm:p-7 relative overflow-hidden"
              style={{
                background: isHero ? 'var(--ink)' : '#fff',
                color: isHero ? '#fff' : 'var(--ink)',
                boxShadow: isHero ? '0 18px 40px rgba(11,11,15,0.22)' : 'inset 0 0 0 1px var(--line), 0 4px 14px rgba(0,0,0,0.04)',
              }}
            >
              {isHero && (
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 90% 0%, var(--accent) 0%, transparent 50%)', opacity: 0.35, pointerEvents: 'none' }} />
              )}
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: isHero ? 'rgba(255,255,255,0.1)' : 'var(--accent-tint)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
                    <Icon name={p.icon} size={22} />
                  </div>
                  {isHero && (
                    <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--accent)' }}>MOST POPULAR</span>
                  )}
                </div>
                <h2 className="mt-5" style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>{p.name}</h2>
                <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14.5, color: isHero ? 'rgba(255,255,255,0.65)' : 'var(--ink-soft)', marginTop: 4, lineHeight: 1.45 }}>{p.tag} · {p.blurb}</p>
                <div className="mt-7" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 44, letterSpacing: '-0.03em', lineHeight: 1 }}>${p.price}</span>
                  <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: isHero ? 'rgba(255,255,255,0.6)' : 'var(--ink-faint)', letterSpacing: '0.04em' }}>starting · per unit</span>
                </div>
                <div className="mt-6">
                  <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: isHero ? 'rgba(255,255,255,0.55)' : 'var(--ink-faint)', marginBottom: 8 }}>Sizes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sizes.map((s) => (
                      <span key={s} style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, fontWeight: 600, padding: '5px 10px', borderRadius: 8, background: isHero ? 'rgba(255,255,255,0.08)' : 'var(--surface)', color: isHero ? '#fff' : 'var(--ink)', boxShadow: isHero ? 'none' : 'inset 0 0 0 1px var(--line)' }}>{s}</span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/builder?product=${p.id}`}
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-transform active:scale-[0.98] w-full"
                  style={{
                    background: isHero ? 'var(--accent)' : 'var(--ink)',
                    color: '#fff',
                    boxShadow: isHero ? '0 8px 22px var(--accent-glow)' : 'none',
                    fontFamily: 'var(--font-manrope), system-ui',
                    fontSize: 15, height: 48, padding: '0 20px', letterSpacing: '-0.01em',
                  }}
                >
                  Make a {p.name.toLowerCase().replace(/s$/, '')}
                  <Icon name="chevR" size={16} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-16">
        <h2 className="text-center" style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
          Every order includes
        </h2>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([['shield', 'Secure checkout', 'Stripe-powered, your card never touches us'], ['truck', 'Ships 3–5 days', 'Printed and shipped from the US']] as const).map(([ic, t, body]) => (
            <div key={t} className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                <Icon name={ic} size={18} />
              </div>
              <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginTop: 12 }}>{t}</div>
              <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
