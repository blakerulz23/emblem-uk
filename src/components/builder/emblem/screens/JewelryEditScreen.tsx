'use client';

import { useRef } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Stepper, Mono } from '../primitives';
import Icon from '../Icon';
import JewelryPreview from '../JewelryPreview';
import AIMockupBlock from '../AIMockupBlock';
import { removeBackgroundSmart, readBlobAsDataUrl } from '../bgRemoval';
import {
  JEWELRY_MATERIALS,
  JEWELRY_SHAPES,
  JEWELRY_TYPES,
} from '../data';

const JEWELRY_INSPIRATION: Array<[string, string, string]> = [
  ['#3d2c1f', '#d4af37', 'Maya'],
  ['#1f1f24', '#c6c8cc', 'Jordan'],
  ['#3a1d20', '#bf7e85', 'Sofia'],
  ['#101013', '#5c5c63', 'Diego'],
  ['#2a1f10', '#f7df9e', 'Avery'],
  ['#1c1c20', '#bf7e85', 'Riley'],
  ['#2a1a08', '#d4af37', 'Cam'],
  ['#1a1f24', '#c6c8cc', 'Noah'],
];

export default function JewelryEditScreen() {
  const {
    jewelry, setJewelry, setJewelryLogo, clearJewelryLogo,
    qty, setQty, next,
  } = useEmblem();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isAI = jewelry.aiMode;

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      const original = await readBlobAsDataUrl(file);
      setJewelryLogo({ src: original, processed: null, status: 'processing', error: undefined });
      const { dataUrl, method } = await removeBackgroundSmart(file);
      setJewelryLogo({ src: original, processed: dataUrl, status: 'ready', method });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background removal failed';
      setJewelryLogo({ processed: null, status: 'error', error: message });
    }
  };

  return (
    <Screen
      footer={<Btn full kind="primary" iconR="chevR" onClick={() => next()}>Review order</Btn>}
    >
      <Kicker
        title="Make it personal."
        sub={isAI
          ? 'Custom render — drop a photo and we’ll preview it as the finished charm.'
          : 'Stainless steel, hand-finished. Upload a photo or logo — we’ll print it inside the charm.'}
      />

      {/* TOP: Custom block (replaces preview in AI mode) or standard live preview */}
      {isAI ? (
        <AIMockupBlock
          kind="jewelry-charm"
          image={jewelry.aiImage}
          onImage={(img) => setJewelry({ aiImage: img })}
          label="Custom photo"
          hint="Drop a clear, front-facing photo. We'll render it as a polished jewelry charm."
          height={300}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            background: 'radial-gradient(70% 100% at 50% 50%, #fafafc 0%, transparent 70%)',
            padding: '14px 8px 24px',
            minHeight: 260,
          }}
        >
          <JewelryPreview jewelry={jewelry} size={jewelry.type === 'necklace' ? 220 : 240} />
        </div>
      )}

      {/* Photo / logo uploader — for non-AI modes */}
      {!isAI && (
        <div
          style={{
            padding: 14,
            borderRadius: 18,
            background: '#fff',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Upload your photo
            </Mono>
            {jewelry.logo.status === 'ready' && (
              <button
                type="button"
                onClick={clearJewelryLogo}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
                  color: 'var(--ink-soft)', padding: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <Icon name="trash" size={13} /> Remove
              </button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
          {!jewelry.logo.src ? (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              style={{
                width: '100%',
                minHeight: 80,
                borderRadius: 14,
                border: 'none',
                background: 'var(--surface)',
                boxShadow: 'inset 0 0 0 1.5px var(--line)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 44, height: 44, borderRadius: 11, background: '#fff',
                  display: 'grid', placeItems: 'center', color: 'var(--accent)',
                  boxShadow: '0 4px 14px rgba(0,0,0,.06)', flexShrink: 0,
                }}
              >
                <Icon name="upload" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  Upload your image
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 1, lineHeight: 1.3 }}>
                  Photo, logo, monogram — we&apos;ll cut out the background and print it in the charm.
                </div>
              </div>
              <Icon name="chevR" size={17} style={{ color: 'var(--ink-faint)' }} />
            </button>
          ) : (
            <div
              style={{
                borderRadius: 14,
                background: 'var(--surface)',
                boxShadow: 'inset 0 0 0 1.5px var(--line)',
                padding: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: 'linear-gradient(45deg, #fff 25%, #e9eaee 25%, #e9eaee 50%, #fff 50%, #fff 75%, #e9eaee 75%) 0/14px 14px',
                  position: 'relative', flexShrink: 0, overflow: 'hidden',
                }}
              >
                {jewelry.logo.processed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={jewelry.logo.processed} alt="" style={{ position: 'absolute', inset: 3, width: 'calc(100% - 6px)', height: 'calc(100% - 6px)', objectFit: 'contain' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={jewelry.logo.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                  {jewelry.logo.status === 'processing' && 'Removing background…'}
                  {jewelry.logo.status === 'ready' && (jewelry.logo.method === 'canvas' ? 'Cut out (simple)' : 'Cut out (clean)')}
                  {jewelry.logo.status === 'error' && 'Couldn’t cut it out'}
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.35 }}>
                  {jewelry.logo.status === 'processing' && 'First run loads a small model.'}
                  {jewelry.logo.status === 'ready' && (jewelry.logo.method === 'canvas' ? 'Used a flat-background trimmer.' : 'Used the ML model.')}
                  {jewelry.logo.status === 'error' && (jewelry.logo.error || 'Used as-is.')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                style={{
                  border: 'none', cursor: 'pointer', background: '#fff', color: 'var(--ink)',
                  borderRadius: 10, padding: '7px 12px',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                }}
              >
                Replace
              </button>
            </div>
          )}
        </div>
      )}

      {/* Type toggle — hidden in custom mode */}
      {!isAI && (
        <div style={{ marginTop: 22 }}>
          <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            Type
          </Mono>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {JEWELRY_TYPES.map((t) => {
              const isActive = jewelry.type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setJewelry({ type: t.id })}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 14,
                    padding: '14px 12px',
                    fontFamily: 'var(--font-manrope), system-ui',
                    fontWeight: 700,
                    fontSize: 14,
                    background: isActive ? 'var(--accent-tint)' : 'var(--surface)',
                    color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
                    boxShadow: isActive ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name={t.icon} size={22} />
                  {t.name}
                  <span
                    style={{
                      fontFamily: 'var(--font-manrope), system-ui',
                      fontWeight: 500,
                      fontSize: 11,
                      color: isActive ? 'var(--accent)' : 'var(--ink-faint)',
                    }}
                  >
                    {t.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Shape toggle — Circle / Rectangle / AI Mockup. AI Mockup is a virtual
          third option that flips `aiMode` while leaving the underlying shape alone. */}
      <div style={{ marginTop: 22 }}>
        <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
          Shape
        </Mono>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {JEWELRY_SHAPES.map((s) => {
            const isActive = !jewelry.aiMode && jewelry.shape === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setJewelry({ shape: s.id, aiMode: false })}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 14,
                  padding: '12px 10px',
                  fontFamily: 'var(--font-manrope), system-ui',
                  fontWeight: 700,
                  fontSize: 13,
                  background: isActive ? 'var(--accent-tint)' : 'var(--surface)',
                  color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
                  boxShadow: isActive ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                <Icon name={s.icon} size={16} />
                {s.name}
              </button>
            );
          })}
          {/* Custom (AI-rendered) virtual option */}
          <button
            type="button"
            onClick={() => setJewelry({ aiMode: true })}
            style={{
              border: 'none',
              cursor: 'pointer',
              borderRadius: 14,
              padding: '12px 10px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700,
              fontSize: 13,
              background: jewelry.aiMode ? 'var(--accent-tint)' : 'var(--surface)',
              color: jewelry.aiMode ? 'var(--accent)' : 'var(--ink-soft)',
              boxShadow: jewelry.aiMode ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
              gridColumn: '1 / -1',
            }}
          >
            <Icon name="sparkle" size={16} />
            Custom
          </button>
        </div>
      </div>

      {/* Material — hidden in AI mode */}
      {!isAI && (
        <div style={{ marginTop: 22 }}>
          <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            Material
          </Mono>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {JEWELRY_MATERIALS.map((m) => {
              const isActive = jewelry.material === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-label={m.name}
                  onClick={() => setJewelry({ material: m.id })}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    border: 'none',
                    cursor: 'pointer',
                    background: `linear-gradient(135deg, ${m.highlight} 0%, ${m.base} 50%, ${m.dark} 100%)`,
                    boxShadow: isActive
                      ? '0 0 0 2px var(--accent), 0 4px 10px rgba(0,0,0,0.12)'
                      : '0 4px 10px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.06)',
                    position: 'relative',
                    transition: 'box-shadow .15s ease',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  title={m.name}
                >
                  {isActive && (
                    <span style={{ color: m.id === 'silver' || m.id === 'gold' || m.id === 'rose-gold' ? m.fg : '#fff' }}>
                      <Icon name="check" size={18} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Mono style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
            {JEWELRY_MATERIALS.find((m) => m.id === jewelry.material)?.name} · stainless steel finish
          </Mono>
        </div>
      )}

      {/* Quantity */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Quantity
          </Mono>
          <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            One size · 15+3cm adjustable chain
          </Mono>
        </div>
        <Stepper value={qty} onChange={setQty} />
      </div>

      {/* Inspiration carousel */}
      <div style={{ marginTop: 32, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            See it on
          </Mono>
          <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-faint)' }}>
            How others wear theirs
          </span>
        </div>
        <div
          style={{
            overflow: 'hidden',
            margin: '0 -22px',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)',
            maskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)',
          }}
        >
          <div className="wb-inspo-marquee">
            {[0, 1].map((dup) => (
              <div className="wb-inspo-group" key={dup}>
                {JEWELRY_INSPIRATION.map(([bg, accent, name], i) => (
                  <div
                    key={`${dup}-${i}`}
                    style={{
                      flex: '0 0 132px',
                      aspectRatio: '4 / 5',
                      borderRadius: 16,
                      background: `radial-gradient(120% 100% at 50% 0%, ${bg} 0%, ${bg}dd 50%, #0c0c10 100%)`,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(11,11,15,.18)',
                    }}
                  >
                    <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
                      <defs>
                        <linearGradient id={`j-insp-${dup}-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
                          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
                        </linearGradient>
                      </defs>
                      <circle cx="50" cy="46" r="20" fill={`url(#j-insp-${dup}-${i})`} />
                      <path d="M14 130 c0-32 16-54 36-54 s36 22 36 54 z" fill={`url(#j-insp-${dup}-${i})`} />
                      {i % 2 === 0 ? (
                        <>
                          <path d="M32 78 Q50 90 68 78" fill="none" stroke={accent} strokeWidth="1" />
                          <circle cx="50" cy="86" r="3" fill={accent} />
                        </>
                      ) : (
                        <>
                          <path d="M22 102 Q50 108 78 102" fill="none" stroke={accent} strokeWidth="1" />
                          <circle cx="50" cy="105" r="2.5" fill={accent} />
                        </>
                      )}
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: 10,
                        bottom: 10,
                        color: '#fff',
                        fontFamily: 'var(--font-sora), system-ui',
                        fontWeight: 700,
                        fontSize: 13,
                        textShadow: '0 2px 6px rgba(0,0,0,0.35)',
                      }}
                    >
                      {name}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <Mono style={{ display: 'block', marginTop: 8, fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>
          Placeholders — swap with real customer photos.
        </Mono>
      </div>
    </Screen>
  );
}
