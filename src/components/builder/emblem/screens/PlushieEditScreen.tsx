'use client';

import { useEffect, useRef } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import { dataUrlToResized, generateAIMockup } from '../aiMockup';

const COPY = {
  plushies: {
    title: 'Their tiny plush twin.',
    sub: "We'll render an AI preview of your photo, then hand-sew a 6-inch plush keychain.",
    matLabel: 'Fabric',
    matTitle: 'Premium soft minky plush',
    matBody: 'Each plushie is hand-stitched from soft minky fleece with embroidered face details. CPSIA-safe filling, machine-washable, ~6 inches tall.',
    mockLabel: 'Real plushie smiles',
    btnIdle: 'Generate plushie preview',
    loadingPrimary: 'Stitching your plushie',
    unit: 'plushie',
    unitPlural: 'plushies',
    showMockups: true,
    altText: 'Plushie preview',
  },
  figurinez: {
    title: 'Their hero figurine.',
    sub: "We'll render an AI preview, then sculpt and hand-paint a premium 6-inch collectible.",
    matLabel: 'Material',
    matTitle: 'Hand-painted resin sculpt',
    matBody: 'Each figurine is sculpted from premium resin and hand-painted by artists. Includes a polished display base. ~6 inches tall.',
    mockLabel: 'Real figurine drops',
    btnIdle: 'Generate figurine preview',
    loadingPrimary: 'Sculpting your figurine',
    unit: 'figurine',
    unitPlural: 'figurines',
    showMockups: false,
    altText: 'Figurine preview',
  },
  coins: {
    title: 'Their commemorative coin.',
    sub: "We'll render an AI preview, then strike a polished metal coin.",
    matLabel: 'Material',
    matTitle: 'Polished metal coin',
    matBody: 'Each coin is struck from polished metal alloy with custom raised relief. ~1.5 inches in diameter.',
    mockLabel: 'Real coin previews',
    btnIdle: 'Generate coin preview',
    loadingPrimary: 'Striking your coin',
    unit: 'coin',
    unitPlural: 'coins',
    showMockups: false,
    altText: 'Coin preview',
  },
} as const;

const TIERS = {
  plushies: [
    { qty: 1, price: 59 }, { qty: 3, price: 50 }, { qty: 5, price: 50 },
    { qty: 10, price: 35 }, { qty: 50, price: 25 }, { qty: 100, price: 15 },
    { qty: 500, price: 8 }, { qty: 1000, price: 6 },
  ],
  figurinez: [
    { qty: 1, price: 79 }, { qty: 3, price: 69 }, { qty: 5, price: 59 },
    { qty: 10, price: 49 }, { qty: 50, price: 39 }, { qty: 100, price: 29 },
    { qty: 500, price: 22 }, { qty: 1000, price: 18 },
  ],
  coins: [
    { qty: 1, price: 29 }, { qty: 3, price: 25 }, { qty: 5, price: 22 },
    { qty: 10, price: 18 }, { qty: 50, price: 14 }, { qty: 100, price: 10 },
    { qty: 500, price: 7 }, { qty: 1000, price: 5 },
  ],
} as const;

function pricePerUnit(tiers: ReadonlyArray<{ qty: number; price: number }>, q: number): number {
  let p = tiers[0].price;
  for (const t of tiers) { if (q >= t.qty) p = t.price; }
  return p;
}

const PLUSH_INSPIRATION: Array<[string, string, string]> = [
  ['#f3d6c8', '#FF5A1F', 'Maya'],
  ['#c6c8cc', '#7c3aed', 'Jordan'],
  ['#f6efe2', '#0ea5e9', 'Sofia'],
  ['#e6e8eb', '#16a34a', 'Diego'],
  ['#fde0e4', '#ec4899', 'Avery'],
  ['#dde6ff', '#1e3a8a', 'Riley'],
  ['#f8f1e0', '#d97706', 'Cam'],
  ['#dff5e7', '#22c55e', 'Noah'],
];

export default function PlushieEditScreen() {
  const { photo, plushie, setPlushie, qty, setQty, next, product } = useEmblem();
  const triedOnce = useRef(false);
  const initQty = useRef(false);
  useEffect(() => { if (!initQty.current) { setQty(5); initQty.current = true; } }, [setQty]);

  const key = (product === 'figurinez' || product === 'coins') ? product : 'plushies';
  const copy = COPY[key];
  const tiers = TIERS[key];

  useEffect(() => {
    if (triedOnce.current) return;
    if (!photo) return;
    if (plushie.aiImage || plushie.status === 'generating') return;
    triedOnce.current = true;
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  async function runGenerate() {
    if (!photo) return;
    setPlushie({ status: 'generating', error: undefined });
    try {
      const resized = await dataUrlToResized(photo);
      const kind = product === 'figurinez' ? 'figurine' : product === 'coins' ? 'coin' : 'plushie';
      const { image } = await generateAIMockup(resized, kind);
      setPlushie({ aiImage: image, status: 'ready' });
    } catch (e) {
      setPlushie({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  return (
    <Screen
      footer={
        <Btn full kind="primary" iconR="chevR" onClick={() => next()} disabled={!plushie.aiImage}>
          {plushie.aiImage ? 'Review order' : 'Generating mockup'}
        </Btn>
      }
    >
      <Kicker title={copy.title} sub={copy.sub} />

      <div style={{ position: 'relative', minHeight: 320, borderRadius: 22, background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {plushie.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plushie.aiImage} alt={copy.altText} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        ) : plushie.status === 'generating' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink-soft)', padding: 36 }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
            <Mono style={{ fontSize: 12 }}>{copy.loadingPrimary}</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~10-20 seconds</Mono>
          </div>
        ) : plushie.status === 'error' ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {plushie.error || 'Generation failed'}
            </div>
            <button type="button" onClick={runGenerate} style={{ marginTop: 12, border: 'none', cursor: 'pointer', background: 'var(--ink)', color: '#fff', borderRadius: 10, padding: '8px 14px', fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13 }}>
              Try again
            </button>
          </div>
        ) : (
          <button type="button" onClick={runGenerate} disabled={!photo} style={{ border: 'none', cursor: photo ? 'pointer' : 'default', background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '14px 22px', fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 24px var(--accent-glow)', opacity: photo ? 1 : 0.4 }}>
            <Icon name="sparkle" size={17} /> {copy.btnIdle}
          </button>
        )}
      </div>

      {plushie.aiImage && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={runGenerate} style={{ border: 'none', cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 10, padding: '8px 14px', fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px var(--line)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={14} /> Regenerate
          </button>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
          {copy.matLabel}
        </Mono>
        <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, background: 'linear-gradient(135deg, #f5d7c4, #e8b89b)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>
              {copy.matTitle}
            </div>
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 500, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.45 }}>
              {copy.matBody}
            </div>
          </div>
        </div>
      </div>

      {copy.showMockups && (
        <div style={{ marginTop: 32, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>See it on</Mono>
            <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-faint)' }}>{copy.mockLabel}</span>
          </div>
          <div style={{ overflow: 'hidden', margin: '0 -22px', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)' }}>
            <div className="wb-inspo-marquee">
              {[0, 1].map((dup) => (
                <div className="wb-inspo-group" key={dup}>
                  {PLUSH_INSPIRATION.map(([bg, accent, name], i) => (
                    <div key={`${dup}-${i}`} style={{ flex: '0 0 132px', aspectRatio: '4 / 5', borderRadius: 16, background: `radial-gradient(120% 100% at 50% 0%, ${bg} 0%, ${bg}cc 60%, #0c0c10 100%)`, position: 'relative', overflow: 'hidden', boxShadow: '0 8px 20px rgba(11,11,15,.18)' }}>
                      <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
                        <defs>
                          <radialGradient id={`p-insp-${dup}-${i}`} cx="50%" cy="40%" r="55%">
                            <stop offset="0" stopColor={accent} stopOpacity="0.95" />
                            <stop offset="1" stopColor={accent} stopOpacity="0.55" />
                          </radialGradient>
                        </defs>
                        <circle cx="50" cy="46" r="28" fill={`url(#p-insp-${dup}-${i})`} />
                        <ellipse cx="50" cy="92" rx="34" ry="28" fill={`url(#p-insp-${dup}-${i})`} />
                        <circle cx="44" cy="44" r="3" fill="#0b0b0f" />
                        <circle cx="56" cy="44" r="3" fill="#0b0b0f" />
                        <path d="M44 53 Q50 58 56 53" fill="none" stroke="#0b0b0f" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      <div style={{ position: 'absolute', left: 10, bottom: 10, color: '#fff', fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>
                        {name}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <Mono style={{ display: 'block', marginTop: 8, fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>Placeholders - swap with real customer photos.</Mono>
        </div>
      )}

      <div style={{ marginTop: 16, marginBottom: 16, padding: '16px 18px', borderRadius: 14, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>QUANTITY</Mono>
          <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
            {qty} {qty === 1 ? copy.unit : copy.unitPlural}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={tiers.length - 1}
          step={1}
          value={Math.max(0, tiers.findIndex((t) => t.qty === qty))}
          onChange={(e) => setQty(tiers[Number(e.target.value)].qty)}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {tiers.map((t) => (
            <button key={t.qty} type="button" onClick={() => setQty(t.qty)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-jbmono), monospace', fontSize: 10, fontWeight: qty === t.qty ? 800 : 500, color: qty === t.qty ? 'var(--accent)' : 'var(--ink-faint)' }}>
              {t.qty >= 1000 ? '1k+' : t.qty}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink-soft)' }}>
            ${(pricePerUnit(tiers, qty) * qty).toLocaleString()} total
          </div>
          <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 22, color: 'var(--accent)' }}>
            ${pricePerUnit(tiers, qty)} <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12, color: 'var(--ink-soft)' }}>per {copy.unit}</span>
          </div>
        </div>
      </div>
    </Screen>
  );
}
