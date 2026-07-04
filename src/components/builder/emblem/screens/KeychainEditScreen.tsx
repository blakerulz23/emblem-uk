'use client';

import { useRef, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Stepper, Mono } from '../primitives';
import Icon from '../Icon';
import CardArt from '../CardArt';
import AIMockupBlock from '../AIMockupBlock';
import { removeBackgroundSmart, readBlobAsDataUrl } from '../bgRemoval';
import {
  KEYCHAIN_SHAPES,
  type KeychainShape,
  CARD_TEMPLATES,
} from '../data';

// Placeholder customer photos showing keychains. Swap for real images later.
const KEY_INSPIRATION: Array<[string, string, string]> = [
  ['#0b0b0f', '#d4a456', 'Caden'],
  ['#1e3a8a', '#FFFFFF', 'Jordan'],
  ['#7c3aed', '#FFFFFF', 'Sofia'],
  ['#16a34a', '#FFFFFF', 'Diego'],
  ['#dc2626', '#FFFFFF', 'Avery'],
  ['#ec4899', '#FFFFFF', 'Riley'],
  ['#d97706', '#FFFFFF', 'Cam'],
  ['#0ea5e9', '#FFFFFF', 'Noah'],
];

export default function KeychainEditScreen() {
  const {
    photo,
    details, setDetail,
    keychain, setKeychain, setKeychainLogo, clearKeychainLogo,
    qty, setQty,
    next,
  } = useEmblem();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [tplId, setTplId] = useState<string>(CARD_TEMPLATES[0]?.id || 'prism-cobalt');
  const chosenTemplate = CARD_TEMPLATES.find(t => t.id === tplId) || CARD_TEMPLATES[0];

  const logo = keychain.logo;
  const logoReady = logo.status === 'ready';
  const isAI = keychain.aiMode;

  const onUploadLogo = async (file?: File | null) => {
    if (!file) return;
    try {
      const original = await readBlobAsDataUrl(file);
      setKeychainLogo({ src: original, processed: null, status: 'processing', error: undefined });
      const { dataUrl, method } = await removeBackgroundSmart(file);
      setKeychainLogo({ src: original, processed: dataUrl, status: 'ready', method });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background removal failed';
      setKeychainLogo({ processed: null, status: 'error', error: message });
    }
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    maxLength,
    mono,
    type = 'text',
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    maxLength?: number;
    mono?: boolean;
    type?: 'text' | 'tel';
  }) => (
    <label style={{ display: 'block' }}>
      <Mono
        style={{
          display: 'block',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: 6,
        }}
      >
        {label}
      </Mono>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: 46,
          borderRadius: 12,
          border: 'none',
          padding: '0 14px',
          fontFamily: mono ? 'var(--font-jbmono), monospace' : 'var(--font-manrope), system-ui',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--ink)',
          background: 'var(--surface)',
          outline: 'none',
          boxShadow: 'inset 0 0 0 1px var(--line)',
        }}
      />
    </label>
  );

  const shapePreviewSize: Record<KeychainShape, number> = {
    circular: 220,
    rectangular: 180,
    slab: 170,
  };

  return (
    <Screen
      footer={
        <Btn full kind="primary" iconR="chevR" onClick={() => next()}>
          Review order
        </Btn>
      }
    >
      <Kicker
        title="Design your keychain."
        sub={isAI
          ? 'Custom render — drop a photo and we’ll preview it as a die-cut acrylic keychain.'
          : 'Clear acrylic frame, 3 inches, double-sided. Pick a template to slot inside.'}
      />

      {/* TOP: Custom block (replaces preview in custom mode) or standard live preview */}
      {isAI ? (
        <AIMockupBlock
          kind="keychain-charm"
          image={keychain.aiImage}
          onImage={(img) => setKeychain({ aiImage: img })}
          label="Custom photo"
          hint="Drop a clear, front-facing photo. We'll render it as a die-cut acrylic keychain."
          height={300}
        />
      ) : (
        <div
        style={{
          display: 'grid',
          placeItems: 'center',
          background: 'radial-gradient(70% 100% at 50% 50%, #fafafc 0%, transparent 70%)',
          padding: '18px 8px 28px',
          minHeight: 300,
        }}
      >
        <div style={{ position: 'relative', width: 320, aspectRatio: '1060 / 1484' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/keychainbase.jpg" alt="Clear acrylic keychain" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          <div style={{ position: 'absolute', left: '24%', top: '30%', width: '52%', height: '58%', display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
            <CardArt template={chosenTemplate} photo={photo} details={details} size={180} side="front" />
          </div>
        </div>
      </div>
      )}

      {/* Template picker — choose which card design slots into the acrylic frame */}
      <div>
        <Mono
          style={{
            display: 'block',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: 10,
          }}
        >
          Design
        </Mono>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, paddingTop: 2, margin: '0 -2px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
          {CARD_TEMPLATES.map((t) => {
            const active = !keychain.aiMode && t.id === tplId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTplId(t.id); setKeychain({ aiMode: false }); }}
                style={{
                  flex: '0 0 auto',
                  scrollSnapAlign: 'start',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 12,
                  padding: 8,
                  background: active ? 'var(--accent-tint)' : 'var(--surface)',
                  boxShadow: active ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div style={{ width: 72, height: 100, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  <CardArt template={t} photo={photo} details={details} size={72} side="front" />
                </div>
                <Mono style={{ fontSize: 10, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink-soft)', maxWidth: 80, textAlign: 'center', lineHeight: 1.2 }}>
                  {t.name || t.id}
                </Mono>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setKeychain({ aiMode: true })}
            style={{
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 14,
              padding: '12px 10px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700,
              fontSize: 13,
              background: keychain.aiMode ? 'var(--accent-tint)' : 'var(--surface)',
              color: keychain.aiMode ? 'var(--accent)' : 'var(--ink-soft)',
              boxShadow: keychain.aiMode ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
            }}
          >
            <Icon name="sparkle" size={16} />
            {keychain.aiMode ? 'Using custom AI render' : 'Use custom AI render instead'}
          </button>
        </div>
      </div>

      {/* Player / team / edition / logo — hidden in custom mode */}
      {!isAI && (
        <>
          {/* Player details */}
          <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
            <Mono
              style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              Player
            </Mono>
            <Field
              label="Name"
              value={details.name}
              onChange={(v) => setDetail('name', v.slice(0, 22))}
              placeholder="Caden Isaacs"
              maxLength={22}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
              <Field
                label="Number"
                value={details.number}
                onChange={(v) => setDetail('number', v.replace(/\D/g, '').slice(0, 3))}
                placeholder="00"
                mono
                type="tel"
              />
              <Field
                label="Position"
                value={details.position}
                onChange={(v) => setDetail('position', v.slice(0, 14))}
                placeholder="POINT GUARD"
                maxLength={14}
              />
            </div>
          </div>

          {/* Team */}
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <Mono
              style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              Team
            </Mono>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field
                label="Team name"
                value={details.team}
                onChange={(v) => setDetail('team', v.slice(0, 14))}
                placeholder="KINGS"
                maxLength={14}
              />
              <Field
                label="City"
                value={keychain.city}
                onChange={(v) => setKeychain({ city: v.slice(0, 14) })}
                placeholder="NASHVILLE"
                maxLength={14}
              />
            </div>
          </div>

          {/* Edition */}
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <Mono
              style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              Edition
            </Mono>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
              <Field
                label="Year"
                value={keychain.year}
                onChange={(v) => setKeychain({ year: v.replace(/\D/g, '').slice(0, 4) })}
                placeholder="2026"
                mono
                type="tel"
              />
              <Field
                label="Series #"
                value={keychain.series}
                onChange={(v) => setKeychain({ series: v.slice(0, 11) })}
                placeholder="001/250"
                mono
              />
            </div>
          </div>

          {/* Team logo upload */}
          <div
            style={{
              marginTop: 22,
              padding: 14,
              borderRadius: 18,
              background: '#fff',
              boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Mono
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                }}
              >
                Team logo
              </Mono>
              {logoReady && (
                <button
                  type="button"
                  onClick={clearKeychainLogo}
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
              onChange={(e) => onUploadLogo(e.target.files?.[0])}
            />
            {!logo.src ? (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                style={{
                  width: '100%',
                  minHeight: 76,
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
                    width: 42, height: 42, borderRadius: 11,
                    background: '#fff', display: 'grid', placeItems: 'center',
                    color: 'var(--accent)', boxShadow: '0 4px 14px rgba(0,0,0,.06)', flexShrink: 0,
                  }}
                >
                  <Icon name="upload" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
                    Upload team logo
                  </div>
                  <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 1, lineHeight: 1.3 }}>
                    We&apos;ll auto-remove the background and place it at the top of the keychain.
                  </div>
                </div>
                <Icon name="chevR" size={16} style={{ color: 'var(--ink-faint)' }} />
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
                    width: 50, height: 50, borderRadius: 10,
                    background: 'linear-gradient(45deg, #fff 25%, #e9eaee 25%, #e9eaee 50%, #fff 50%, #fff 75%, #e9eaee 75%) 0/14px 14px',
                    position: 'relative', flexShrink: 0, overflow: 'hidden',
                  }}
                >
                  {logo.processed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.processed} alt="" style={{ position: 'absolute', inset: 3, width: 'calc(100% - 6px)', height: 'calc(100% - 6px)', objectFit: 'contain' }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                    {logo.status === 'processing' && 'Removing background…'}
                    {logo.status === 'ready' && (logo.method === 'canvas' ? 'Cut out (simple)' : 'Cut out (clean)')}
                    {logo.status === 'error' && 'Couldn’t cut it out'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.3 }}>
                    {logo.status === 'processing' && 'First run loads a small model.'}
                    {logo.status === 'ready' && (logo.method === 'canvas' ? 'Used a flat-background trimmer.' : 'Used the ML model.')}
                    {logo.status === 'error' && (logo.error || 'Used as-is.')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  style={{
                    border: 'none', cursor: 'pointer', background: '#fff', color: 'var(--ink)',
                    borderRadius: 9, padding: '6px 10px',
                    fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12,
                    boxShadow: 'inset 0 0 0 1px var(--line)',
                  }}
                >
                  Replace
                </button>
              </div>
            )}
            {!logoReady && (
              <Mono style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)' }}>
                Optional. Until you upload one, the keychain shows your team name in the corner.
              </Mono>
            )}
          </div>
        </>
      )}

      {/* Quantity */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Quantity
          </Mono>
          <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            Fixed 3&quot; size · double-sided
          </Mono>
        </div>
        <Stepper value={qty} onChange={setQty} />
      </div>

      {/* Inspiration auto-scroll marquee */}
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
                {KEY_INSPIRATION.map(([bg, accent, name], i) => (
                  <div
                    key={`${dup}-${i}`}
                    style={{
                      flex: '0 0 132px',
                      aspectRatio: '4 / 5',
                      borderRadius: 16,
                      background: `radial-gradient(120% 100% at 50% 0%, ${bg} 0%, ${bg}dd 50%, #1a1a22 100%)`,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(11,11,15,.18)',
                    }}
                  >
                    <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
                      <defs>
                        <linearGradient id={`kc-insp-${dup}-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
                          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
                        </linearGradient>
                      </defs>
                      <circle cx="50" cy="46" r="20" fill={`url(#kc-insp-${dup}-${i})`} />
                      <path d="M14 130 c0-32 16-54 36-54 s36 22 36 54 z" fill={`url(#kc-insp-${dup}-${i})`} />
                      <rect x="64" y="80" width="14" height="20" rx="3" fill={accent} opacity="0.85" />
                      <circle cx="71" cy="78" r="2" fill="#fff" opacity="0.85" />
                    </svg>
                    <div
                      style={{
                        position: 'absolute', left: 10, bottom: 10,
                        color: '#fff', fontFamily: 'var(--font-sora), system-ui',
                        fontWeight: 700, fontSize: 13,
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
