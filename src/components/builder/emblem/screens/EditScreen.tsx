'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Field, Stepper } from '../primitives';
import CardArt from '../CardArt';
import ProductMock from '../ProductMock';
import { EMJFL_CLUBS, SIZES, SPORTS, SPORT_STATS, type PhysicalKey } from '../data';

const LABEL: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-faint)',
  fontFamily: 'var(--font-jbmono), monospace',
  marginBottom: 8,
};

const SECTION: CSSProperties = {
  borderTop: '1px solid var(--line)',
  paddingTop: 20,
  marginTop: 4,
  display: 'grid',
  gap: 14,
};

import type { CSSProperties } from 'react';

export default function EditScreen() {
  const {
    photo, logo, setLogo,
    photoScale, setPhotoScale,
    photoOffsetX, setPhotoOffsetX,
    photoOffsetY, setPhotoOffsetY,
    sport, setSport,
    stats, setStat,
    backText, setBackText,
    physical, setPhysical,
    details, setDetail,
    product, template,
    size, setSize,
    qty, setQty,
    next,
  } = useEmblem();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [side, setSide] = useState<'front' | 'back'>('front');
  // Puzzles: lock to front side only
  useEffect(() => { if ((product as string) === 'puzzles' && side !== 'front') setSide('front'); }, [product, side]);
  const [flipping, setFlipping] = useState(false);
  const sizes = SIZES[product] || ['One size'];
  const sportStats = SPORT_STATS[sport];

  const flip = useCallback(() => {
    setFlipping(true);
    setTimeout(() => {
      setSide(s => s === 'front' ? 'back' : 'front');
      setFlipping(false);
    }, 180);
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogo(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [setLogo]);

  const preview = product === 'cards' || product === 'puzzles'
    ? (
      <CardArt
        template={template} photo={photo} details={details}
        logo={logo} stats={stats} sport={sport} backText={backText} physical={physical}
        side={side} size={150}
        photoScale={photoScale} photoOffsetX={photoOffsetX} photoOffsetY={photoOffsetY}
        style={{ transform: flipping ? 'rotateY(90deg)' : 'rotateY(0deg)', transition: 'transform 0.18s ease' }}
      />
    )
    : <ProductMock product={product} photo={photo} details={details} accent="#FF5A1F" size={product === 'wristbands' ? 240 : 150} />;

  return (
    <Screen
      footer={<Btn full kind="primary" iconR="chevR" onClick={() => next()}>Review order</Btn>}
    >
      <Kicker title="Make it theirs." sub="Edit the details — your preview updates live." />

      <div style={{ display: 'grid', placeItems: 'center', padding: '6px 0 12px', minHeight: 215 }}>
        {preview}
      </div>

      {/* Photo resize controls — only shown when photo is uploaded and on front */}
      {(product === 'cards' || product === 'puzzles') && photo && side === 'front' && (
        <div style={{ marginBottom: 16, display: 'grid', gap: 10 }}>
          {[
            { label: 'Zoom', value: photoScale, min: 0.5, max: 3, step: 0.05, set: setPhotoScale, fmt: (v: number) => `${v.toFixed(1)}×` },
            { label: 'Horizontal', value: photoOffsetX, min: -40, max: 40, step: 1, set: setPhotoOffsetX, fmt: (v: number) => `${v > 0 ? '+' : ''}${v}` },
            { label: 'Vertical', value: photoOffsetY, min: -40, max: 40, step: 1, set: setPhotoOffsetY, fmt: (v: number) => `${v > 0 ? '+' : ''}${v}` },
          ].map(({ label, value, min, max, step, set, fmt }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 36px', gap: 10, alignItems: 'center' }}>
              <div style={{ ...LABEL, marginBottom: 0 }}>{label}</div>
              <input type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ fontFamily: 'var(--font-jbmono),monospace', fontSize: 11, color: 'var(--ink-faint)', textAlign: 'right' }}>{fmt(value)}</div>
            </div>
          ))}
        </div>
      )}

      {product === 'cards' && (
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            width: 188,
            margin: '0 auto 18px',
            padding: 4,
            borderRadius: 14,
            background: 'var(--surface)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: side === 'front' ? 4 : '50%',
              width: 'calc(50% - 4px)',
              borderRadius: 10,
              background: 'var(--accent)',
              boxShadow: '0 8px 18px rgba(0,0,0,.14)',
              transition: 'left .18s ease',
              pointerEvents: 'none',
            }}
          />
          {(product as string) !== 'puzzles' && (['front', 'back'] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setSide(s); setFlipping(true); setTimeout(() => setFlipping(false), 180); }}
              style={{ position: 'relative', zIndex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', background: 'transparent', color: side === s ? '#fff' : 'var(--ink-soft)', textTransform: 'uppercase', transition: 'color .18s ease' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Player details ── */}
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Athlete name" value={details.name} onChange={(v) => setDetail('name', v)} placeholder="Jordan Avery" maxLength={18} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
          <Field label="Number" value={details.number} onChange={(v) => setDetail('number', v.replace(/\D/g, '').slice(0, 2))} placeholder="23" mono />
          <Field label="Position" value={details.position} onChange={(v) => setDetail('position', v.slice(0, 8))} placeholder="GUARD" />
        </div>
        <Field label="Team" value={details.team} onChange={(v) => setDetail('team', v.slice(0, 20))} placeholder="Eastside Hawks" maxLength={20} />
      </div>

      {/* ── EMJFL club badge picker ── */}
      {product === 'cards' && template?.family === 'EMJFL' && (
        <div style={SECTION}>
          <div style={LABEL}>Club</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {EMJFL_CLUBS.map((club) => {
              const active = logo === club.badgePath;
              return (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => { setLogo(club.badgePath); setDetail('team', club.name); }}
                  title={club.name}
                  style={{
                    display: 'grid', placeItems: 'center', gap: 4, padding: '8px 4px',
                    borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: active ? 'var(--accent-tint)' : 'var(--surface)',
                    boxShadow: active ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={club.badgePath} alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: '50%' }} />
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope),system-ui', textAlign: 'center', lineHeight: 1.2 }}>{club.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team logo upload ── */}
      {product === 'cards' && template?.family !== 'EMJFL' && (
        <div style={SECTION}>
          <div style={LABEL}>Team Logo</div>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          {logo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="logo" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 8, background: 'var(--line)' }} />
              <div style={{ flex: 1, fontSize: 13.5, fontFamily: 'var(--font-manrope),system-ui', fontWeight: 600, color: 'var(--ink)' }}>Logo uploaded</div>
              <button type="button" onClick={() => setLogo(null)} style={{ fontSize: 12, color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-manrope),system-ui' }}>Remove</button>
            </div>
          ) : (
            <button type="button" onClick={() => logoInputRef.current?.click()} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: '1.5px dashed var(--line)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 600, fontSize: 14 }}>
              + Upload team logo
            </button>
          )}
        </div>
      )}

      {/* ── Sport + Stats ── */}
      {product === 'cards' && (
        <div style={SECTION}>
          <div style={LABEL}>Sport</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SPORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSport(s.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 12, padding: '9px 14px', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 700, fontSize: 13.5, background: sport === s.id ? 'var(--accent-tint)' : 'var(--surface)', color: sport === s.id ? 'var(--accent)' : 'var(--ink-soft)', boxShadow: sport === s.id ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)' }}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          <div style={LABEL}>Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {sportStats.map((stat) => (
              <div key={stat.key}>
                <div style={{ ...LABEL, marginBottom: 5 }}>{stat.label}</div>
                <input
                  type="text"
                  value={stats[stat.key] || ''}
                  onChange={(e) => setStat(stat.key, e.target.value.slice(0, 6))}
                  placeholder="—"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: 'none', boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-jbmono),monospace', fontWeight: 700, fontSize: 15, textAlign: 'center', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Back of card ── */}
      {product === 'cards' && template?.family !== 'Champions' && template?.family !== 'EMJFL' && (
        <div style={SECTION}>
          <div style={LABEL}>Back of Card</div>
          <div>
            <div style={{ ...LABEL, marginBottom: 5 }}>Bio</div>
            <textarea
              value={backText}
              onChange={(e) => setBackText(e.target.value.slice(0, 220))}
              placeholder="A short bio about the athlete…"
              rows={3}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none', boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-manrope),system-ui', fontSize: 14, resize: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink-faint)', marginTop: 3, fontFamily: 'var(--font-jbmono),monospace' }}>{backText.length}/220</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([ ['height', 'Height', "5'11\""], ['age', 'Age', '16'], ['classYear', 'Class', '2027'], ['hometown', 'Hometown', 'Atlanta, GA'] ] as [PhysicalKey, string, string][]).map(([key, label, placeholder]) => (
              <div key={key}>
                <div style={{ ...LABEL, marginBottom: 5 }}>{label}</div>
                <input
                  type="text"
                  value={physical[key]}
                  onChange={(e) => setPhysical(key, e.target.value.slice(0, 20))}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: 'none', boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-manrope),system-ui', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {template?.family !== 'Champions' && (
      <div style={{ ...SECTION, gap: 16 }}>
        <div>
          <div style={LABEL}>Size</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sizes.map((s) => (
              <button key={s} type="button" onClick={() => setSize(s)} style={{ border: 'none', cursor: 'pointer', borderRadius: 12, padding: '11px 16px', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 700, fontSize: 14, background: size === s ? 'var(--accent-tint)' : 'var(--surface)', color: size === s ? 'var(--accent)' : 'var(--ink-soft)', boxShadow: size === s ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={LABEL}>Quantity</div>
          <Stepper value={qty} onChange={setQty} />
        </div>
      </div>
      )}
    </Screen>
  );
}
