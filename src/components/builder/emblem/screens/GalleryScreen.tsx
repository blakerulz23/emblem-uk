'use client';

import { useMemo, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import ProductArt from '../ProductArt';
import CardArt from '../CardArt';
import {
  CARD_TEMPLATES,
  DEFAULT_EMJFL_CLUB,
  REAL_FAMILIES,
  KEYCHAIN_SHAPES,
  CHARM_SHAPES,
  type CardTemplate,
  type CharmShape,
  type Family,
  type KeychainShape,
  type ProductId,
} from '../data';

// Each gallery tile renders ONE "choice". For cards/posters/stickers a choice
// is just a template. For keychains and magnets it's a (template, shape) pair
// so the user sees every template in every physical shape variant.
type Choice = {
  template: CardTemplate;
  keychainShape?: KeychainShape;
  charmShape?: CharmShape;
  key: string;
};

function buildChoices(product: ProductId, templates: CardTemplate[]): Choice[] {
  if (product === 'keychains') {
    return templates.map((t) => ({ template: t, key: t.id }));
  }
  if (product === 'magnets') {
    const out: Choice[] = [];
    for (const t of templates) {
      for (const s of CHARM_SHAPES) {
        out.push({ template: t, charmShape: s.id, key: `${t.id}|${s.id}` });
      }
    }
    return out;
  }
  return templates.map((t) => ({ template: t, key: t.id }));
}

function FamilyFilter({
  fam,
  setFam,
}: {
  fam: Family | null;
  setFam: (f: Family | null) => void;
}) {
  const chips: Array<{ id: Family | null; label: string }> = [
    { id: null, label: 'All' },
    ...REAL_FAMILIES.map((f) => ({ id: f, label: String(f) })),
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        margin: '0 -4px 14px',
        scrollbarWidth: 'none',
      }}
    >
      {chips.map((c) => {
        const active = c.id === fam;
        return (
          <button
            key={c.id || 'all'}
            type="button"
            onClick={() => setFam(c.id)}
            style={{
              flex: '0 0 auto',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 14px',
              borderRadius: 999,
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? '#fff' : 'var(--ink)',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 600,
              fontSize: 13,
              boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--line)',
              whiteSpace: 'nowrap',
              transition: 'all .15s ease',
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export default function GalleryScreen() {
  const { product, photo, details, template, setTemplate, setKeychain, setMagnet, next, logo, setLogo, setDetail } = useEmblem();
  const [fam, setFam] = useState<Family | null>(template?.family ?? null);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => (fam ? CARD_TEMPLATES.filter((t) => t.family === fam) : CARD_TEMPLATES),
    [fam]
  );

  const choices = useMemo(() => buildChoices(product, filtered), [product, filtered]);

  // Initial render budget per product. Magnets/keychains have more total
  // tiles so we show more upfront to feel browsable; otherwise stay at 12.
  const initialCount = product === 'magnets' ? 18 : 12;
  const visible = showAll ? choices : choices.slice(0, initialCount);

  const pickChoice = (c: Choice) => {
    setTemplate(c.template);
    if (c.keychainShape) setKeychain({ shape: c.keychainShape });
    if (c.charmShape) setMagnet({ shape: c.charmShape });
    // Seed a default club badge the first time someone picks the EMJFL template.
    if (c.template.family === 'EMJFL' && !logo) {
      setLogo(DEFAULT_EMJFL_CLUB.badgePath);
      setDetail('team', DEFAULT_EMJFL_CLUB.name);
    }
  };

  const kickerSub =
    product === 'keychains'
      ? `${choices.length} designs. Tap one to preview it inside the acrylic frame.`
      : product === 'magnets'
        ? `${choices.length} combos — 108 designs across 2 shapes (circular, rectangular). Tap one to preview.`
        : 'Tap a design to preview it. Real templates: Futuristic (20), Chrome Legacy (26), Galaxy Holo (26) — plus 36 procedural designs. Every card is NFC-enabled.';

  return (
    <Screen
      footer={
        <Btn full kind="primary" iconR="chevR" onClick={() => next()}>
          Customize this design
        </Btn>
      }
    >
      <Kicker title="Your photo, 108 ways." sub={kickerSub} />

      {(product as string) === 'keychains' ? (
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            gap: 16,
            margin: '8px -22px 0',
            padding: '4px 22px 24px',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {Array.from(new Set(CARD_TEMPLATES.map((t) => t.family))).map((fam) => {
            const tpl = CARD_TEMPLATES.find((t) => t.family === fam);
            if (!tpl) return null;
            const selected = template?.id === tpl.id;
            return (
              <div
                key={String(fam)}
                style={{
                  scrollSnapAlign: 'center',
                  flexShrink: 0,
                  width: 'calc(85vw - 44px)',
                  maxWidth: 320,
                }}
              >
                <button
                  type="button"
                  onClick={() => setTemplate(tpl)}
                  style={{
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'transparent',
                    padding: 12,
                    borderRadius: 22,
                    boxShadow: selected
                      ? '0 0 0 3px var(--accent), 0 20px 40px rgba(11,11,15,.16)'
                      : 'inset 0 0 0 1px var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transition: 'box-shadow .15s ease, transform .15s ease',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1060 / 1484' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/keychainbase.jpg"
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: '24%',
                        top: '30%',
                        width: '52%',
                        height: '58%',
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                    >
                      <CardArt template={tpl} photo={photo} details={details} size={140} side="front" />
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 16,
                      fontWeight: 700,
                      color: selected ? 'var(--accent)' : 'var(--ink)',
                      fontFamily: 'var(--font-sora), system-ui',
                      textAlign: 'center',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {String(fam)}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <FamilyFilter
        fam={fam}
        setFam={(f) => {
          setFam(f);
          setShowAll(false);
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {visible.map((c) => {
          const selected = template?.id === c.template.id;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => pickChoice(c)}
              style={{
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                padding: 8,
                borderRadius: 16,
                boxShadow: selected
                  ? '0 0 0 2px var(--accent), 0 8px 20px rgba(11,11,15,.12)'
                  : 'inset 0 0 0 1px var(--line)',
                display: 'grid',
                placeItems: 'center',
                aspectRatio: '1 / 1.2',
                transition: 'transform .12s ease, box-shadow .12s ease',
              }}
            >
              {product === 'keychains' ? (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1060 / 1484' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/keychainbase.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  <div style={{ position: 'absolute', left: '24%', top: '30%', width: '52%', height: '58%', display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                    <CardArt template={c.template} photo={photo} details={details} size={56} side="front" />
                  </div>
                </div>
              ) : (
                <ProductArt
                  product={product}
                  template={c.template}
                  photo={photo}
                  details={details}
                  size={108}
                  keychainShape={c.keychainShape}
                  charmShape={c.charmShape}
                  selected={selected}
                />
              )}
            </button>
          );
        })}
      </div>

      {!showAll && choices.length > initialCount && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            width: '100%',
            marginTop: 14,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--surface)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--ink)',
          }}
        >
          Show all {choices.length}
          <Icon name="chevD" size={16} />
        </button>
      )}

      {showAll && (
        <Mono
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--ink-faint)',
            marginTop: 14,
          }}
        >
          That's everything · {choices.length} {product === 'keychains' || product === 'magnets' ? 'combos' : 'designs'}
        </Mono>
      )}
    
        </>
      )}
      </Screen>
  );
}
