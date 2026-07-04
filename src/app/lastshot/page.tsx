'use client';

import Link from 'next/link';
import { useRef } from 'react';
import {
  CARD_TEMPLATES,
  DEFAULT_JEWELRY,
  DEFAULT_MAGNET,
  DEFAULT_PIN,
  EMPTY_LOGO,
  SAMPLE_PHOTO,
  type CardTemplate,
} from '@/components/builder/emblem/data';
import CardArt from '@/components/builder/emblem/CardArt';
import ProductMock from '@/components/builder/emblem/ProductMock';
import WristbandPreview from '@/components/builder/emblem/WristbandPreview';
import JewelryPreview from '@/components/builder/emblem/JewelryPreview';
import PhotoCharmPreview from '@/components/builder/emblem/PhotoCharmPreview';
import Icon from '@/components/builder/emblem/Icon';
import HappyCustomers from '@/components/CustomerMarquee';

const HERO_DETAILS = { name: 'Caden Isaacs', number: '23', team: 'Westridge Wolves', position: 'POINT GUARD' };

const pick = (id: string): CardTemplate =>
  CARD_TEMPLATES.find((t) => t.id === id) || CARD_TEMPLATES[0];

type LineupItemId =
  | 'cards' | 'posters' | 'wristbands' | 'stickers' | 'keychains' | 'jewelry'
  | 'pins' | 'magnets' | 'plushies' | 'bobbleheads'
  | 'figurinez';

const LINEUP: Array<{
  id: LineupItemId;
  name: string;
  tag: string;
  price?: number;
  product?: 'cards' | 'posters' | 'wristbands' | 'stickers' | 'keychains' | 'jewelry' | 'pins' | 'magnets' | 'plushies' | 'bobbleheads' | 'figurinez'
  | 'figurinez';
}> = [
  { id: 'cards',       name: 'Trading Cards', tag: '24 designs - NFC',      price: 24, product: 'cards' },
  { id: 'posters',     name: 'Posters',       tag: 'Up to 24Ã36"',          price: 32, product: 'posters' },
  { id: 'stickers',    name: 'Stickers',      tag: 'Die-cut vinyl',         price: 9,  product: 'stickers' },
  { id: 'keychains',   name: 'Keychains',     tag: 'Double-sided - 3"',     price: 12, product: 'keychains' },
];

function LineupVisual({ p }: { p: (typeof LINEUP)[number] }) {
  if (p.id === 'cards') {
    return <CardArt template={pick('prism-citrus')} photo={SAMPLE_PHOTO} details={HERO_DETAILS} size={166} />;
  }
  if (p.id === 'wristbands') {
    return (
      <div style={{ transform: 'rotate(-2deg)' }}>
        <WristbandPreview
          state={{
            band:  { preset: 'bold', colorId: 'black', text: 'GO HAWKS', logo: EMPTY_LOGO },
            patch: { kind: 'brand', text: '', colorId: 'white', logo: EMPTY_LOGO },
            active: 'band',
          }}
          width={210}
          bandHeight={32}
        />
      </div>
    );
  }
  if (p.id === 'jewelry') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(-3deg)' }}>
        <Icon name="jewelry" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'pins') {
    return (
      <div style={{ transform: 'rotate(-4deg)' }}>
        <PhotoCharmPreview charm={DEFAULT_PIN} photo={SAMPLE_PHOTO} details={HERO_DETAILS} kind="pin" size={140} />
      </div>
    );
  }
  if (p.id === 'magnets') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(2deg)' }}>
        <Icon name="magnet" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'plushies') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
        <Icon name="plush" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'bobbleheads') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
        <Icon name="bobble" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'posters') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(-2deg)' }}>
        <Icon name="poster" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'stickers') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(4deg)' }}>
        <Icon name="sticker" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'keychains') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(-3deg)' }}>
        <Icon name="key" size={78} stroke={1.4} />
      </div>
    );
  }
  if (p.id === 'figurinez') {
    return (
      <div style={{ width: 140, height: 140, borderRadius: 28, background: '#fff', boxShadow: '0 10px 28px rgba(11,11,15,.08)', display: 'grid', placeItems: 'center', color: 'var(--accent)', transform: 'rotate(1deg)' }}>
        <Icon name="plush" size={78} stroke={1.4} />
      </div>
    );
  }
  return null;
}

function Lineup() {
  const ref = useRef<HTMLDivElement | null>(null);
  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 268, behavior: 'smooth' });
  };
  return (
    <section id="products" style={{ maxWidth: 1140, margin: '0 auto', padding: 'clamp(56px, 8vw, 104px) 28px', overflow: 'clip' }}>
      <div className="carousel-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--ink-faint)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
            ONE PHOTO, A WHOLE LINEUP
          </span>
          <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.025em', margin: 0, color: 'var(--ink)', textWrap: 'balance' as 'balance' }}>
            Show your Last Shot pride.
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {([['Previous', -1 as -1, 'chevL'], ['Next', 1 as 1, 'chevR']] as const).map(([label, dir, icon]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => scroll(dir)}
              style={{
                width: 48, height: 48, borderRadius: 999, border: '1px solid var(--line)',
                background: '#fff', color: 'var(--ink)', display: 'grid', placeItems: 'center',
                cursor: 'pointer', transition: 'background .15s ease, transform .15s ease, box-shadow .2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(11,11,15,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <Icon name={icon} size={20} />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={ref}
        className="no-scrollbar"
        style={{
          display: 'flex', gap: 18, overflowX: 'auto', scrollSnapType: 'x mandatory',
          padding: '6px 4px 24px', margin: '-6px -4px 0', WebkitOverflowScrolling: 'touch',
        }}
      >
        {LINEUP.map((p) => {
          const slide = (
            <div
              style={{
                scrollSnapAlign: 'start', flex: '0 0 250px',
                background: '#fff', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 20px 44px rgba(11,11,15,.1)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              <div style={{ position: 'relative', height: 268, background: 'var(--surface)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <LineupVisual p={p} />
              </div>
              <div style={{ padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>{p.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope), system-ui' }}>{p.tag}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                    from ${p.price}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 14, color: 'var(--accent)', fontFamily: 'var(--font-manrope), system-ui' }}>
                    Customize <Icon name="chevR" size={15} />
                  </span>
                </div>
              </div>
            </div>
          );
          return (
            <Link
              key={p.id}
              href={p.product ? `/builder?product=${p.product}` : '/builder'}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {slide}
            </Link>
          );
        })}
      </div>
    </section>
  );
}


export default function Home() {
  const fan = [
    { tpl: pick('aurora-violet'), rot: -13, x: -18, y: 26, z: 1 },
    { tpl: pick('carbon-cobalt'), rot: 0, x: 0, y: 0, z: 3 },
    { tpl: pick('prism-citrus'), rot: 13, x: 18, y: 26, z: 2 },
  ];

  return (
    <div style={{ overflowX: 'clip' as 'clip' }}>
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) 28px clamp(48px, 7vw, 88px)' }}>
        <div className="hero-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--ink-faint)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
              OFFICIAL TIE-IN - LAST SHOT FILM
            </span>
            <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 'clamp(34px, 5.4vw, 58px)', lineHeight: 1.02, letterSpacing: '-0.03em', margin: 0, color: 'var(--ink)', textWrap: 'balance' as 'balance' }}>
              Make your card like the players in Last Shot.
            </h1>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 'clamp(16px, 1.5vw, 18.5px)', lineHeight: 1.5, color: 'var(--ink-soft)', margin: 0, maxWidth: '46ch', textWrap: 'pretty' as 'pretty' }}>
              Trading cards, posters, stickers, and keychains â designed in the style of the film. Upload one photo and become a Last Shot player. In theaters April 8, 2026.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }} className="cta-row">
              <Link href="/builder?from=lastshot" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, borderRadius: 14, height: 52, padding: '0 22px', fontSize: 16, background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px var(--accent-glow)', transition: 'transform .15s ease, box-shadow .2s ease' }}>
                <Icon name="upload" size={19} /> Upload a photo
              </Link>
              <Link href="#products" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, borderRadius: 14, height: 52, padding: '0 22px', fontSize: 16, background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                See the lineup
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8, fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {['350gsm card stock', 'Real NFC chips', 'Ships in 3â5 days'].map((t) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: 'var(--accent)' }}><Icon name="check" size={15} /></span>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 440 }}>
            <div aria-hidden style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: 999, background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', filter: 'blur(20px)' }} />
            {fan.map((f, i) => (
              <div key={i} style={{ gridArea: '1 / 1', transform: `translate(${f.x}px, ${f.y}px) rotate(${f.rot}deg)`, zIndex: f.z, filter: 'drop-shadow(0 30px 50px rgba(11,11,15,.22))' }}>
                <div style={{
                position: 'relative',
                display: 'inline-block',
                width: 320,
                maxWidth: '100%',
                animation: 'home-card-float 7s ease-in-out infinite',
                filter: 'drop-shadow(0 28px 50px rgba(11,11,15,0.32))',
                willChange: 'transform',
              }}>
                <div style={{
                  position: 'relative',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/last-shot/caden-isaacs.png"
                    alt="Custom trading card showing a young basketball player on a premium Last Shot template"
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                  />
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      overflow: 'hidden',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '-15%',
                        left: 0,
                        width: '40%',
                        height: '130%',
                        background: 'linear-gradient(115deg, transparent 35%, rgba(255,210,255,0.45) 44%, rgba(170,220,255,0.5) 50%, rgba(180,255,220,0.45) 56%, transparent 65%)',
                        filter: 'blur(2px)',
                        mixBlendMode: 'overlay',
                        animation: 'home-card-shine 6s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0,
                      height: '35%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, transparent 100%)',
                      mixBlendMode: 'overlay',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HappyCustomers />
      <Lineup />

      <section id="tap" style={{ maxWidth: 'none', padding: 0 }}>
        <div style={{ maxWidth: 1140, margin: 'clamp(20px, 4vw, 40px) auto', padding: 'clamp(40px, 6vw, 72px) clamp(28px, 5vw, 72px)', background: 'var(--ink)', borderRadius: 'clamp(24px, 4vw, 40px)', display: 'grid', gridTemplateColumns: '1.1fr 1fr', alignItems: 'center', gap: 48, position: 'relative', overflow: 'hidden' }} className="tap-grid">
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, var(--accent), transparent 45%)', opacity: 0.35, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--accent)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
              THE TAP
            </span>
            <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.025em', margin: 0, color: '#fff', textWrap: 'balance' as 'balance' }}>
              A card with a hidden surprise.
            </h2>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 'clamp(16px, 1.5vw, 18.5px)', lineHeight: 1.5, color: 'rgba(255,255,255,.72)', margin: 0, maxWidth: '46ch', textWrap: 'pretty' as 'pretty' }}>
              Tap any card with a phone and a digital profile springs to life â stats, highlight clips, social links, the whole story. No app, no setup. Just a fun bonus on top of a card they already love.
            </p>
            <Link href="/builder" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, borderRadius: 14, height: 52, padding: '0 22px', fontSize: 16, background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px var(--accent-glow)' }}>
              Make their card <Icon name="chevR" size={18} />
            </Link>
          </div>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 300 }}>
            <div style={{ filter: 'drop-shadow(0 26px 50px rgba(0,0,0,.4))' }}>
              <CardArt template={pick('prism-cobalt')} photo={SAMPLE_PHOTO} details={HERO_DETAILS} size={200} />
            </div>
            <div className="nfc-wave" style={{ position: 'absolute', right: '8%', top: '14%', width: 64, height: 64, borderRadius: 999, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Icon name="nfc" size={30} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
