'use client';

import { useSearchParams } from 'next/navigation';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Mono } from '../primitives';
import Icon from '../Icon';
import CardArt from '../CardArt';
import PosterArt from '../PosterArt';
import StickerArt from '../StickerArt';
import KeychainArt from '../KeychainArt';
import MagnetArt from '../MagnetArt';
import PhotoCharmPreview from '../PhotoCharmPreview';
import WristbandPreview from '../WristbandPreview';
import JewelryPreview from '../JewelryPreview';
import {
  CARD_TEMPLATES,
  DEFAULT_JEWELRY,
  DEFAULT_PIN,
  DEFAULT_WRISTBAND,
  PRODUCTS,
  type CardTemplate,
  type Details,
  type ProductId,
} from '../data';

// The carousel always shows ONE example from each Real family (Futuristic,
// Chrome, Galaxy). Indices 0, 1, 2 in CARD_TEMPLATES correspond to those in order.
type HeroSlot =
  | { kind: 'template'; idx: number; family: string }
  | { kind: 'more' };
const HERO_SLOTS: HeroSlot[] = [
  { kind: 'template', idx: 0, family: 'Futuristic' },
  { kind: 'template', idx: 46, family: 'Galaxy' },
  { kind: 'template', idx: 73, family: 'Champions' },
  { kind: 'template', idx: 20, family: 'Chrome' },
  { kind: 'template', idx: 72, family: 'Vintage' },
  { kind: 'more' },
];

const HERO_CARD_WIDTH = 180;
const HERO_CARD_GAP = 16;

const OTHER_PRODUCTS: ProductId[] = [
  'posters',
  'puzzles',
  'stickers',
  'keychains',
  'magnets',
  'pins',
  'wristbands',
  'jewelry',
  'plushies',
  'bobbleheads',
  'figurinez',
];

const AI_PRODUCTS = new Set<ProductId>(['plushies', 'bobbleheads']);

// Per-product family color palette for the compact chip tiles.
const STAGE_BG: Record<ProductId, string> = {
  cards:       '#1a1a23',
  posters:     '#ede4ff',
  stickers:    '#ffe1ea',
  keychains:   '#eceef2',
  magnets:     '#e1ecff',
  pins:        '#ffe5dc',
  wristbands:  '#dde5f5',
  jewelry:     '#fff3d6',
  plushies:    '#ffe0ec',
  bobbleheads: '#e8e0ff',
  figurinez:   '#fff0d6',
  puzzles:     '#e6f4ec',
  pendants:    '#f4ece0',
  coins:       '#fff5d6',
  armymen:     '#e6ead6',
  rushmore:    '#e8dfd2',
};
const STAGE_FG: Record<ProductId, string> = {
  cards:       '#ff5a1f',
  posters:     '#6b3aed',
  stickers:    '#d63868',
  keychains:   '#6b6b75',
  magnets:     '#3a6ed0',
  pins:        '#d6593a',
  wristbands:  '#3a4d80',
  jewelry:     '#a07a1c',
  plushies:    '#c43a78',
  bobbleheads: '#6d5acc',
  figurinez:   '#a0762e',
  puzzles:     '#2e7d4f',
  pendants:    '#8a6a2c',
  coins:       '#a07a14',
  armymen:     '#4a5f2c',
  rushmore:    '#5a4628',
};

function MoreCard({ size = 180, active }: { size?: number; active: boolean }) {
  const height = Math.round(size * 1.4);
  return (
    <div
      style={{
        width: size,
        height,
        borderRadius: 12,
        border: '2px dashed',
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: 'var(--surface)',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        placeItems: 'center',
        gap: 16,
        padding: '24px 16px',
        boxShadow: active
          ? '0 18px 32px rgba(11,11,15,0.12)'
          : '0 8px 14px rgba(11,11,15,0.06)',
        transition: 'box-shadow .25s ease, border-color .25s ease',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: active ? 'var(--accent)' : 'var(--ink)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-sora), system-ui',
          fontSize: 36,
          fontWeight: 300,
          lineHeight: 1,
          boxShadow: active
            ? '0 12px 26px rgba(255,90,31,0.45)'
            : '0 8px 18px rgba(11,11,15,0.25)',
          transition: 'background .25s ease, box-shadow .25s ease',
        }}
      >
        +
      </div>
      <div
        style={{
          fontFamily: 'var(--font-manrope), system-ui',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--ink)',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          alignSelf: 'end',
        }}
      >
        View all 108
      </div>
    </div>
  );
}

function HeroCard({
  template,
  photo,
  details,
  active,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  active: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        isolation: 'isolate',
      }}
    >
      {/* Iridescent rim glow — only on the active card */}
      {active && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: -22,
            borderRadius: 24,
            background:
              'conic-gradient(from 0deg, rgba(255,90,31,0.45), rgba(121,40,202,0.45), rgba(42,250,223,0.45), rgba(255,228,0,0.45), rgba(255,90,31,0.45))',
            filter: 'blur(20px)',
            animation: 'emblem-holo-rim 14s linear infinite, emblem-rim-pulse 6s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
      )}

      {/* Floating card */}
      <div
        style={{
          animation: active ? 'emblem-card-float 8s ease-in-out infinite' : 'none',
          transformOrigin: 'center center',
          filter: active
            ? 'drop-shadow(0 18px 32px rgba(11,11,15,0.28))'
            : 'drop-shadow(0 8px 14px rgba(11,11,15,0.18))',
          willChange: 'transform',
          transition: 'filter .25s ease',
        }}
      >
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
          <CardArt template={template} photo={photo} details={details} size={HERO_CARD_WIDTH} />
          {active && (
            <>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(105deg, transparent 32%, rgba(255,0,150,0.18) 40%, transparent 48%), linear-gradient(125deg, transparent 32%, rgba(0,200,255,0.18) 40%, transparent 48%), linear-gradient(145deg, transparent 32%, rgba(150,255,100,0.18) 40%, transparent 48%)',
                  backgroundSize: '300% 300%',
                  mixBlendMode: 'overlay',
                  animation: 'emblem-holo-prism 7s ease-in-out infinite',
                  pointerEvents: 'none',
                }}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'repeating-linear-gradient(115deg, transparent 0px, rgba(255,200,255,0.08) 2px, transparent 5px, rgba(160,255,220,0.08) 7px, transparent 10px, rgba(180,220,255,0.08) 12px, transparent 15px)',
                  backgroundSize: '220% 220%',
                  mixBlendMode: 'overlay',
                  animation: 'emblem-holo-stripes 8s linear infinite',
                  pointerEvents: 'none',
                }}
              />
              <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '-20%',
                    left: 0,
                    width: '45%',
                    height: '140%',
                    background: 'linear-gradient(115deg, transparent 35%, rgba(255,200,255,0.55) 44%, rgba(160,220,255,0.6) 50%, rgba(180,255,220,0.55) 56%, transparent 65%)',
                    filter: 'blur(1.5px)',
                    mixBlendMode: 'overlay',
                    animation: 'emblem-holo-sweep 5s ease-in-out infinite',
                  }}
                />
              </div>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.55), transparent 65%)',
                  filter: 'blur(12px)',
                  mixBlendMode: 'overlay',
                  animation: 'emblem-holo-spec 9s ease-in-out infinite',
                  pointerEvents: 'none',
                }}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '40%',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
                  mixBlendMode: 'overlay',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TinyPreview({
  product,
  size = 36,
}: {
  product: ProductId;
  photo?: string | null;
  details?: Details;
  size?: number;
}) {
  const s = size;
  // Inline SVG icons keyed by product. Stroke uses currentColor so the tile's
  // foreground variable drives the color.
  const Icons: Record<ProductId, JSX.Element> = {
    cards: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="13" height="18" rx="2" />
        <rect x="7" y="6" width="13" height="18" rx="2" />
      </svg>
    ),
    posters: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M5 16l5-5 4 4 5-5" />
        <circle cx="9" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    ),
    stickers: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8c-2 1.5-2 4 0 6" />
      </svg>
    ),
    keychains: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="14" r="6" />
        <path d="M15 11l5-5" />
        <path d="M17 4l3 3" />
      </svg>
    ),
    magnets: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4v9a6 6 0 0 0 12 0V4" />
        <path d="M6 4h4M14 4h4" />
        <path d="M6 9h4M14 9h4" />
      </svg>
    ),
    pins: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l4 5-1.5 4L18 14l-4 1-2 7-2-7-4-1 3.5-3L8 7z" />
      </svg>
    ),
    wristbands: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="12" rx="9" ry="5" />
        <ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(15 12 12)" opacity={0.45} />
      </svg>
    ),
    jewelry: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h16l-8 12z" />
        <path d="M8 8l4-4 4 4" />
        <path d="M8 8l4 12 4-12" />
      </svg>
    ),
    plushies: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 7c-2 1-2 4 0 5M17 7c2 1 2 4 0 5" />
        <ellipse cx="12" cy="13" rx="6" ry="6.5" />
        <circle cx="10" cy="12" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="14" cy="12" r="0.9" fill="currentColor" stroke="none" />
        <path d="M10.5 15.5c.5.5 1.5.5 2 .5s1.5 0 2-.5" />
      </svg>
    ),
    bobbleheads: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="9" r="5" />
        <path d="M9 18h6l-1 4h-4z" />
        <path d="M7 18c0-2 2-3 5-3s5 1 5 3" />
      </svg>
    ),
    figurinez: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2.5" />
        <path d="M9.5 7.5h5l-1 4h-3z" />
        <path d="M9 11.5l-1.5 5 1.5.5M15 11.5l1.5 5-1.5.5" />
        <path d="M10 16l-1 5h6l-1-5z" />
        <ellipse cx="12" cy="22" rx="5" ry="0.7" opacity="0.4" />
      </svg>
    ),
    puzzles: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h7v4a2 2 0 0 0 4 0V3h7v7h-4a2 2 0 0 0 0 4h4v7h-7v-4a2 2 0 0 0-4 0v4H3v-7h4a2 2 0 0 0 0-4H3z" />
      </svg>
    ),
    pendants: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="14" rx="6" ry="8" />
      </svg>
    ),
    coins: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="6" opacity="0.4" />
      </svg>
    ),
    armymen: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="6" r="2.5" />
        <path d="M10 9h4l2 4-1 5h-2l-.5-4h-1l-.5 4h-2l-1-5z" />
      </svg>
    ),
    rushmore: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 19l4-9 4 5 3-7 4 6 5-3v8z" />
      </svg>
    ),
  };
  return Icons[product] ?? null;
}


export default function ProductScreen() {
  const sp = useSearchParams();
  const productOverride = sp?.get('product') || null;

  const { photo, details, setProduct, setTemplate, next } = useEmblem();
  const [activeIdx, setActiveIdx] = useState(2);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);

  // Center Champions (the new middle card at index 2) on first paint, no flicker.
  useLayoutEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const step = HERO_CARD_WIDTH + HERO_CARD_GAP;
    el.scrollLeft = step * 2; // index 2 = middle = Champions
  }, []);

  // Update active card index based on which slide is centered.
  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const step = HERO_CARD_WIDTH + HERO_CARD_GAP;
    const idx = Math.round(el.scrollLeft / step);
    const clamped = Math.max(0, Math.min(idx, HERO_SLOTS.length - 1));
    if (clamped !== activeIdx) setActiveIdx(clamped);
  };

  // Slow right-to-left auto-scroll marquee on the Other Gear strip.
  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    let raf = 0;
    let paused = false;
    let resumeTimer = 0;
    const tick = () => {
      if (!paused && el) {
        el.scrollLeft += 0.4;
        const halfWidth = el.scrollWidth / 2;
        if (halfWidth > 0 && el.scrollLeft >= halfWidth) {
          el.scrollLeft -= halfWidth;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    const pause = () => {
      paused = true;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        paused = false;
      }, 3500);
    };
    el.addEventListener('pointerdown', pause);
    el.addEventListener('wheel', pause, { passive: true });
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      if (resumeTimer) window.clearTimeout(resumeTimer);
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('wheel', pause);
    };
  }, []);

  const choose = (id: ProductId) => {
    // For cards, hand the selected design's template to the next step so the chip filter lands on the right family.
    if (id === 'cards') {
      const slot = HERO_SLOTS[activeIdx];
      if (slot && slot.kind === 'template') {
        setTemplate(CARD_TEMPLATES[slot.idx]);
      }
    }
    setProduct(id);
    next(id);
  };

  return (
    <Screen footer={null}>
      <Kicker
        title="Choose Your Style"
        sub={'108 designs across 3 families \u00B7 swipe to preview.'}
      />

      {/* HERO CAROUSEL — 3 templates side-by-side, snap-to-center */}
      <div style={{ position: 'relative', marginTop: 4 }}>
        <div
          ref={carouselRef}
          onScroll={onCarouselScroll}
          style={{
            display: 'flex',
            gap: HERO_CARD_GAP,
            overflowX: 'auto',
            overflowY: 'visible',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingLeft: `calc(50% - ${HERO_CARD_WIDTH / 2}px)`,
            paddingRight: `calc(50% - ${HERO_CARD_WIDTH / 2}px)`,
            paddingTop: 28,
            paddingBottom: 24,
            margin: '0 -16px',
          }}
        >
          {HERO_SLOTS.map((slot, i) => {
            const isActive = i === activeIdx;
            const slotStyle = {
              flexShrink: 0,
              scrollSnapAlign: 'center' as const,
              width: HERO_CARD_WIDTH,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center' as const,
              padding: 0,
              transition: 'transform .3s ease, opacity .3s ease',
              opacity: isActive ? 1 : 0.55,
              transform: isActive ? 'scale(1)' : 'scale(0.9)',
            };
            if (slot.kind === 'more') {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => choose('cards')}
                  style={slotStyle}
                  aria-label="View all 108 designs"
                >
                  <MoreCard size={HERO_CARD_WIDTH} active={isActive} />
                </button>
              );
            }
            const tpl = CARD_TEMPLATES[slot.idx];
            if (!tpl) return null;
            return (
              <button
                key={slot.idx}
                type="button"
                onClick={() => choose('cards')}
                style={slotStyle}
              >
                <HeroCard template={tpl} photo={photo} details={details} active={isActive} />
              </button>
            );
          })}
        </div>

        {/* Active family label */}
        <Mono
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 4,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: 'var(--accent)',
            transition: 'color .2s',
          }}
        >
          {(() => {
            const s = HERO_SLOTS[activeIdx];
            if (!s) return '';
            if (s.kind === 'more') return 'See all 108';
            return s.family;
          })()}
        </Mono>

        {/* Pagination dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginTop: 10,
          }}
        >
          {HERO_SLOTS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === activeIdx ? 22 : 6,
                height: 6,
                borderRadius: 999,
                background: i === activeIdx ? 'var(--accent)' : 'var(--ink-faint)',
                transition: 'width .25s ease, background .25s ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* CTA pill */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <button
          type="button"
          onClick={() => choose('cards')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--ink)',
            color: '#fff',
            padding: '13px 24px',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 999,
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '-0.01em',
            boxShadow: '0 12px 28px rgba(11,11,15,0.28)',
          }}
        >
          Browse 108 designs
          <Icon name="chevR" size={16} />
        </button>
      </div>

          {process.env.NEXT_PUBLIC_VARIANT !== 'cards' && (
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <Mono
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              whiteSpace: 'nowrap',
            }}
          >
            Or shop other gear
          </Mono>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>
        <div
          ref={marqueeRef}
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 8,
            margin: '0 -4px',
            scrollbarWidth: 'none',
          }}
        >
          {[...OTHER_PRODUCTS, ...OTHER_PRODUCTS].map((id, idx) => {
            const pr = PRODUCTS.find((p) => p.id === id);
            if (pr?.hidden && pr.id !== productOverride) return null;
            if (!pr) return null;
            return (
              <button
                key={`${id}-${idx}`}
                type="button"
                onClick={() => choose(id)}
                style={{
                  minWidth: 90,
                  flexShrink: 0,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'var(--surface)',
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                  borderRadius: 14,
                  padding: '14px 10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: STAGE_BG[id],
                    color: STAGE_FG[id],
                  }}
                >
                  <TinyPreview product={id} size={22} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-manrope), system-ui',
                    fontWeight: 700,
                    fontSize: 12,
                    color: 'var(--ink)',
                    letterSpacing: '-0.01em',
                    textAlign: 'center',
                  }}
                >
                  {pr.name}
                </div>
                
              </button>
            );
          })}
        </div>
      </div>
          )}
    </Screen>
  );
}
