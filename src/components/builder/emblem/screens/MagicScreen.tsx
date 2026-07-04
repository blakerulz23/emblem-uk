'use client';

import { useEffect, useRef, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn } from '../primitives';
import { removeBackgroundSmart } from '../bgRemoval';

async function dataUrlToFile(dataUrl: string, name = 'photo.jpg'): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}


type Status = 'processing' | 'ready' | 'error';

const TAGLINES = [
  'Working some magic…',
  'Adding the finishing touches…',
  'Pulling out the special sauce…',
  'Sprinkling a little stardust…',
  'Almost ready to unveil…',
];

export default function MagicScreen() {
  const { photo, setPhoto, next } = useEmblem();
  const [status, setStatus] = useState<Status>('processing');
  const [tag, setTag] = useState(0);
  const ranRef = useRef(false);

  // Cycle taglines while processing
  useEffect(() => {
    if (status !== 'processing') return;
    const id = window.setInterval(() => setTag((i) => (i + 1) % TAGLINES.length), 2200);
    return () => window.clearInterval(id);
  }, [status]);

  // Run background removal silently on mount
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!photo) {
      setStatus('error');
      return;
    }
    (async () => {
      try {
        const t0 = Date.now();
        const file = await dataUrlToFile(photo, 'photo.jpg');
        const out = await removeBackgroundSmart(file);
        const ms = Date.now() - t0;
        console.log('[MagicScreen] cutout ok via', out.method, 'in', ms, 'ms');
        setPhoto(out.dataUrl);
        setStatus('ready');
      } catch (e) {
        console.error('[MagicScreen] background removal failed', e);
        setStatus('error');
      }
    })();
  }, [photo, setPhoto]);

  const ready = status !== 'processing';

  return (
    <Screen footer={null}>
      <Kicker title="Hang tight." sub="We're building something cool just for you." />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          padding: '24px 0 8px',
        }}
      >
        {/* Animated magic orb */}
        <div
          style={{
            position: 'relative',
            width: 200,
            height: 200,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {/* Outer rotating ring */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 200, height: 200,
              borderRadius: '50%',
              background:
                'conic-gradient(from 0deg, rgba(255,90,31,0) 0deg, rgba(255,90,31,0.6) 90deg, rgba(255,90,31,0) 180deg, rgba(121,40,202,0.55) 270deg, rgba(255,90,31,0) 360deg)',
              filter: 'blur(8px)',
              animation: 'magic-orb-rotate 4s linear infinite',
            }}
          />
          {/* Inner counter-rotating ring */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 150, height: 150,
              borderRadius: '50%',
              background:
                'conic-gradient(from 90deg, rgba(42,250,223,0) 0deg, rgba(42,250,223,0.55) 120deg, rgba(255,228,0,0.45) 240deg, rgba(42,250,223,0) 360deg)',
              filter: 'blur(6px)',
              animation: 'magic-ring-rotate-reverse 5.5s linear infinite',
            }}
          />
          {/* Pulsing core */}
          <div
            aria-hidden
            style={{
              position: 'relative',
              width: 96, height: 96,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 35% 30%, #fff 0%, var(--accent) 35%, #6b18b8 100%)',
              boxShadow:
                '0 0 40px rgba(255,90,31,0.55), inset 0 -8px 22px rgba(0,0,0,0.18)',
              animation: 'magic-orb-pulse 2.6s ease-in-out infinite',
            }}
          />
          {/* Sparkles around the orb */}
          {[
            { top: '6%', left: '50%', size: 8, delay: '0s' },
            { top: '20%', left: '88%', size: 6, delay: '0.4s' },
            { top: '50%', left: '94%', size: 10, delay: '0.9s' },
            { top: '80%', left: '78%', size: 7, delay: '1.3s' },
            { top: '92%', left: '48%', size: 9, delay: '1.7s' },
            { top: '78%', left: '12%', size: 6, delay: '2.1s' },
            { top: '45%', left: '4%', size: 9, delay: '2.5s' },
            { top: '18%', left: '14%', size: 7, delay: '2.9s' },
          ].map((s, i) => (
            <div
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                marginTop: -s.size / 2,
                marginLeft: -s.size / 2,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, #fff 0%, rgba(255,90,31,0.85) 50%, transparent 70%)',
                animation: `magic-sparkle 1.8s ease-in-out ${s.delay} infinite`,
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>

        {/* Rotating tagline */}
        <div style={{ minHeight: 26, textAlign: 'center' }}>
          <div
            key={status === 'ready' ? 'ready' : tag}
            style={{
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 600,
              fontSize: 15.5,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
              animation: status === 'ready' ? 'none' : 'magic-text-fade 2.2s ease-in-out infinite',
            }}
          >
            {status === 'ready' ? 'Ready when you are.' : status === 'error' ? 'Ready when you are.' : TAGLINES[tag]}
          </div>
        </div>

        {/* Shimmer progress bar (decorative) */}
        <div
          aria-hidden
          style={{
            width: 200,
            height: 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(11,11,15,0.06)',
            opacity: status === 'ready' ? 0 : 1,
            transition: 'opacity .3s ease',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background:
                'linear-gradient(90deg, transparent, var(--accent), transparent)',
              backgroundSize: '200% 100%',
              animation: 'magic-shimmer 1.8s linear infinite',
            }}
          />
        </div>
      </div>

      {/* UNVEIL button */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          disabled={!ready}
          onClick={() => next()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            minWidth: 220,
            padding: '16px 32px',
            border: 'none',
            cursor: ready ? 'pointer' : 'not-allowed',
            borderRadius: 999,
            background: ready ? 'var(--accent)' : 'rgba(11,11,15,0.18)',
            color: '#fff',
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            animation: ready ? 'magic-unveil-ready 2.4s ease-in-out infinite' : 'none',
            transition: 'background .3s ease, color .3s ease',
          }}
        >
          Unveil
        </button>
      </div>
    </Screen>
  );
}
