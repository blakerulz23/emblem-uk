'use client';

import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Stepper, Mono } from '../primitives';
import Icon from '../Icon';
import PhotoCharmPreview from '../PhotoCharmPreview';
import AIMockupBlock from '../AIMockupBlock';
import { CHARM_SHAPES, SIZES, type CharmShape } from '../data';

const INSPIRATION_PALETTE: Array<[string, string, string]> = [
  ['#0b0b0f', '#FF5A1F', 'Maya'],
  ['#1e3a8a', '#FFFFFF', 'Jordan'],
  ['#7c3aed', '#FFFFFF', 'Sofia'],
  ['#16a34a', '#FFFFFF', 'Diego'],
  ['#dc2626', '#FFFFFF', 'Avery'],
  ['#ec4899', '#FFFFFF', 'Riley'],
  ['#d97706', '#FFFFFF', 'Cam'],
  ['#0ea5e9', '#FFFFFF', 'Noah'],
];

// One editor for both Pins and Magnets — distinguished by `kind`.
export default function PinMagnetEditScreen({ kind }: { kind: 'pin' | 'magnet' }) {
  const {
    photo, details, setDetail,
    pin, setPin, magnet, setMagnet,
    size, setSize, qty, setQty, next,
    product,
  } = useEmblem();

  const charm = kind === 'pin' ? pin : magnet;
  const setCharm = (patch: { shape?: CharmShape; aiMode?: boolean; aiImage?: string | null; logoSrc?: string | null }) =>
    kind === 'pin' ? setPin(patch) : setMagnet(patch);

  const sizes = SIZES[product] || ['One size'];
  const isAI = charm.aiMode;

  const productLabel = kind === 'pin' ? 'pin' : 'magnet';
  const productLabelTitle = kind === 'pin' ? 'pin' : 'magnet';

  return (
    <Screen
      footer={<Btn full kind="primary" iconR="chevR" onClick={() => next()}>Review order</Btn>}
    >
      <Kicker
        title={`Design your ${productLabelTitle}.`}
        sub={
          isAI
            ? `Custom render — drop a photo and we’ll preview it as the finished ${productLabel}.`
            : kind === 'pin'
              ? 'Hard enamel base, full-color print, butterfly clutch back.'
              : 'Photo magnet on a flexible vinyl-laminated face. Fridge-friendly.'
        }
      />

      {/* TOP: Custom block (replaces preview in custom mode) or standard live preview */}
      {isAI ? (
        <AIMockupBlock
          kind={kind === 'pin' ? 'pin-charm' : 'magnet-charm'}
          image={charm.aiImage}
          onImage={(img) => setCharm({ aiImage: img })}
          label="Custom photo"
          hint={`Drop a clear, front-facing photo. We'll render it as a ${productLabel}.`}
          height={280}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            background: 'radial-gradient(70% 100% at 50% 50%, #fafafc 0%, transparent 70%)',
            padding: '20px 8px 28px',
            minHeight: 240,
          }}
        >
          <PhotoCharmPreview
            charm={charm}
            photo={photo}
            details={details}
            kind={kind}
            size={charm.shape === 'circular' ? 200 : 180}
          />
        </div>
      )}

      {/* Shape picker — Circle / Rectangle, plus AI mockup virtual option */}
      <div>
        <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
          Shape
        </Mono>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {CHARM_SHAPES.map((s) => {
            const isActive = !charm.aiMode && charm.shape === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCharm({ shape: s.id, aiMode: false })}
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                }}
              >
                <Icon name={s.icon} size={18} />
                {s.name}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setCharm({ aiMode: true })}
            style={{
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 14,
              padding: '14px 12px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700,
              fontSize: 14,
              background: charm.aiMode ? 'var(--accent-tint)' : 'var(--surface)',
              color: charm.aiMode ? 'var(--accent)' : 'var(--ink-soft)',
              boxShadow: charm.aiMode ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            <Icon name="sparkle" size={18} />
            Custom
          </button>
        </div>
      </div>

      {/* Player fields — hidden in custom mode */}
      {!isAI && (
        <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
          <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Player (optional)
          </Mono>
          <label style={{ display: 'block' }}>
            <Mono style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
              Name
            </Mono>
            <input
              type="text"
              value={details.name}
              onChange={(e) => setDetail('name', e.target.value.slice(0, 18))}
              placeholder="Caden Isaacs"
              maxLength={18}
              style={{
                width: '100%', boxSizing: 'border-box',
                height: 46, borderRadius: 12, border: 'none',
                padding: '0 14px',
                fontFamily: 'var(--font-manrope), system-ui',
                fontSize: 15, fontWeight: 600, color: 'var(--ink)',
                background: 'var(--surface)', outline: 'none',
                boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <Mono style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
              Number
            </Mono>
            <input
              type="tel"
              value={details.number}
              onChange={(e) => setDetail('number', e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="00"
              style={{
                width: '100%', boxSizing: 'border-box',
                height: 46, borderRadius: 12, border: 'none',
                padding: '0 14px',
                fontFamily: 'var(--font-jbmono), monospace',
                fontSize: 16, fontWeight: 600, color: 'var(--ink)',
                background: 'var(--surface)', outline: 'none',
                boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            />
          </label>
          <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-faint)' }}>
            Leave blank to hide the name plate on the {productLabel}.
          </Mono>
        </div>
      )}

      {/* Size + Quantity */}
      <div style={{ marginTop: 22, display: 'grid', gap: 16 }}>
        {sizes.length > 1 && (
          <div>
            <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Size
            </Mono>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  style={{
                    border: 'none', cursor: 'pointer', borderRadius: 12, padding: '11px 16px',
                    fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14,
                    background: size === s ? 'var(--accent-tint)' : 'var(--surface)',
                    color: size === s ? 'var(--accent)' : 'var(--ink-soft)',
                    boxShadow: size === s ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Quantity
            </Mono>
            {sizes.length === 1 && (
              <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                {sizes[0]} · {kind === 'pin' ? 'enamel pin' : 'photo magnet'}
              </Mono>
            )}
          </div>
          <Stepper value={qty} onChange={setQty} />
        </div>
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
                {INSPIRATION_PALETTE.map(([bg, accent, name], i) => (
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
                        <linearGradient id={`pm-insp-${kind}-${dup}-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
                          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
                        </linearGradient>
                      </defs>
                      <circle cx="50" cy="46" r="20" fill={`url(#pm-insp-${kind}-${dup}-${i})`} />
                      <path d="M14 130 c0-32 16-54 36-54 s36 22 36 54 z" fill={`url(#pm-insp-${kind}-${dup}-${i})`} />
                      <circle cx={kind === 'pin' ? 36 : 64} cy={92} r="4" fill={accent} />
                      <circle cx={kind === 'pin' ? 36 : 64} cy={92} r="1.6" fill="#fff" opacity="0.85" />
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
    
      {/* Logo upload — user uploads a team logo / school crest to add to the design */}
      <div style={{ marginTop: 20 }}>
        <Mono style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
          Upload logo
        </Mono>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label
            style={{
              flex: charm.logoSrc ? '0 0 auto' : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', border: 'none',
              background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)',
              borderRadius: 14, padding: '12px 16px',
              fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            <Icon name="upload" size={16} />
            {charm.logoSrc ? 'Change logo' : 'Upload a logo'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = typeof reader.result === 'string' ? reader.result : null;
                  setCharm({ logoSrc: dataUrl });
                };
                reader.readAsDataURL(file);
                // Reset so the same file can be re-uploaded later if removed
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
          </label>

          {charm.logoSrc && (
            <>
              <div
                aria-label="Uploaded logo"
                style={{
                  width: 60, height: 60, flex: '0 0 auto',
                  borderRadius: 12, background: '#fff',
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                  display: 'grid', placeItems: 'center', overflow: 'hidden',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={charm.logoSrc} alt="" style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
              </div>
              <button
                type="button"
                onClick={() => setCharm({ logoSrc: null })}
                style={{
                  flex: '0 0 auto', cursor: 'pointer', border: 'none',
                  background: 'transparent', color: 'var(--ink-soft)',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13,
                  padding: '8px 6px',
                }}
              >
                Remove
              </button>
            </>
          )}
        </div>
        <Mono style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
          Optional · PNG with transparent background works best
        </Mono>
      </div>
    </Screen>
  );
}
