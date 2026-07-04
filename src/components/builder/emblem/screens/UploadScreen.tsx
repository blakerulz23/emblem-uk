'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Mono } from '../primitives';

const PhotoIcon = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 16l5-5 4 4 3-3 6 6" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
const CameraIcon = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
const SparkleIcon = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.7 4.6L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.4L12 3z" />
    <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.6L19 14z" />
    <path d="M5 14l.7 1.6L7 16l-1.3.6L5 18l-.7-1.4L3 16l1.3-.4L5 14z" />
  </svg>
);

type Slot = {
  id: 'upload' | 'camera' | 'ar';
  title: string;
  sub: string;
  badge?: string;
  iconKind: 'photo' | 'camera' | 'sparkle';
};

const SLOTS: Slot[] = [
  { id: 'upload', title: 'Upload a photo', sub: 'Pick one from your camera roll or files.', iconKind: 'photo' },
  { id: 'camera', title: 'Take a photo',   sub: 'Snap one right now with your camera.',     iconKind: 'camera' },
  { id: 'ar',     title: 'AR Mode',        sub: 'Drop a virtual card around your kid in real time.', badge: 'Coming soon', iconKind: 'sparkle' },
];

const CARD_WIDTH = 220;
const CARD_GAP = 16;

function CardIcon({ kind }: { kind: Slot['iconKind'] }) {
  switch (kind) {
    case 'photo':   return <PhotoIcon />;
    case 'camera':  return <CameraIcon />;
    case 'sparkle': return <SparkleIcon />;
  }
}

function TileCard({
  slot,
  active,
  onClick,
}: {
  slot: Slot;
  active: boolean;
  onClick: () => void;
}) {
  const disabled = slot.id === 'ar';
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={slot.title}
      style={{
        flexShrink: 0,
        scrollSnapAlign: 'center',
        width: CARD_WIDTH,
        minHeight: 300,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'var(--surface)',
        borderRadius: 24,
        padding: '28px 22px 26px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        textAlign: 'center',
        position: 'relative',
        boxShadow: active
          ? '0 22px 38px rgba(11,11,15,0.18), inset 0 0 0 2px var(--accent)'
          : 'inset 0 0 0 1px var(--line), 0 8px 22px rgba(11,11,15,0.06)',
        transition: 'transform .3s ease, opacity .3s ease, box-shadow .3s ease',
        opacity: active ? 1 : disabled ? 0.6 : 0.7,
        transform: active ? 'scale(1)' : 'scale(0.94)',
        ...(disabled ? { borderStyle: 'dashed' } : {}),
      }}
    >
      {/* Icon block */}
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: disabled ? 'rgba(11,11,15,0.04)' : 'var(--accent-tint)',
          color: disabled ? 'var(--ink-soft)' : 'var(--accent)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: disabled ? 'none' : '0 8px 22px rgba(255,90,31,0.18)',
          marginTop: 10,
        }}
      >
        <CardIcon kind={slot.iconKind} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 18,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
        }}
      >
        {slot.title}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-manrope), system-ui',
          fontSize: 13.5,
          color: 'var(--ink-soft)',
          lineHeight: 1.45,
          maxWidth: 180,
        }}
      >
        {slot.sub}
      </div>
      {slot.badge && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            fontFamily: 'var(--font-jbmono), monospace',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#fff',
            background: 'var(--ink)',
            padding: '3px 8px',
            borderRadius: 999,
          }}
        >
          {slot.badge}
        </div>
      )}
    </button>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UploadScreen() {
  const { setPhoto, next } = useEmblem();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0); // start on the leftmost tile (Upload)

  // Initial scroll: center the middle tile
  useLayoutEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, []);

  const onScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const step = CARD_WIDTH + CARD_GAP;
    const idx = Math.round(el.scrollLeft / step);
    const clamped = Math.max(0, Math.min(idx, SLOTS.length - 1));
    if (clamped !== activeIdx) setActiveIdx(clamped);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setPhoto(url);
    next();
  };

  const handleClick = (slot: Slot) => {
    if (slot.id === 'upload') galleryInputRef.current?.click();
    if (slot.id === 'camera') cameraInputRef.current?.click();
    // ar is disabled in the tile, but no-op here as well
  };

  return (
    <Screen footer={null}>
      <Kicker
        title="Start with a photo."
        sub="Swipe to pick how you want to grab a photo of your kid."
      />

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
      />

      <div style={{ position: 'relative', marginTop: 4 }}>
        <div
          ref={carouselRef}
          onScroll={onScroll}
          style={{
            display: 'flex',
            gap: CARD_GAP,
            overflowX: 'auto',
            overflowY: 'visible',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingLeft: `calc(50% - ${CARD_WIDTH / 2}px)`,
            paddingRight: `calc(50% - ${CARD_WIDTH / 2}px)`,
            paddingTop: 18,
            paddingBottom: 18,
            margin: '0 -16px',
          }}
        >
          {SLOTS.map((slot, i) => (
            <TileCard
              key={slot.id}
              slot={slot}
              active={i === activeIdx}
              onClick={() => handleClick(slot)}
            />
          ))}
        </div>

        {/* Pagination dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginTop: 6,
          }}
        >
          {SLOTS.map((_, i) => (
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
    </Screen>
  );
}
