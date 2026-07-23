'use client';

import { useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import CardArt from '../CardArt';
import ProductMock from '../ProductMock';
import WristbandPreview from '../WristbandPreview';
import KeychainPreview from '../KeychainPreview';
import JewelryPreview from '../JewelryPreview';
import PhotoCharmPreview from '../PhotoCharmPreview';
import PrintFileBlock from '../PrintFileBlock';
import {
  JEWELRY_MATERIALS,
  KEYCHAIN_SHAPES,
  PLUSHIE_FABRICS,
  PRODUCTS,
  WRISTBAND_COLORS,
  WRISTBAND_PRESETS,
  isLogoPreset,
  type IconName,
} from '../data';

const MAX_CODES = 5;

export default function ReviewScreen() {
  const {
    photo, details, product, template, size, qty, addToCart,
    wristband, keychain, jewelry, pin, magnet, plushie, bobblehead,
    logo, stats, sport, backText, physical,
    photoScale, photoOffsetX, photoOffsetY,
    referralCodes, setReferralCodes,
  } = useEmblem();
  const [codeDraft, setCodeDraft] = useState('');
  const addDraft = () => {
    if (!codeDraft) return;
    // Accept comma- or space-separated entries, append to existing.
    const incoming = codeDraft.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean);
    setReferralCodes([...referralCodes, ...incoming]);
    setCodeDraft('');
  };
  const removeCode = (c: string) => setReferralCodes(referralCodes.filter((x) => x !== c));
  const atLimit = referralCodes.length >= MAX_CODES;
  const accent = '#FF5A1F';
  const pr = PRODUCTS.find((p) => p.id === product);
  if (!pr) return null;

  const unit = pr.price;
  const sub = unit * qty;
  const ship = 0;

  let thumb: JSX.Element;
  if (product === 'cards') {
    thumb = (
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 6,
          maxWidth: 220,
        }}
      >
        <div style={{ scrollSnapAlign: 'center', flexShrink: 0 }}>
          <CardArt
            template={template}
            photo={photo}
            details={details}
            size={140}
            side="front"
            logo={logo}
            stats={stats}
            sport={sport}
            backText={backText}
            physical={physical}
            photoScale={photoScale}
            photoOffsetX={photoOffsetX}
            photoOffsetY={photoOffsetY}
          />
        </div>
        <div style={{ scrollSnapAlign: 'center', flexShrink: 0 }}>
          <CardArt
            template={template}
            photo={photo}
            details={details}
            size={140}
            side="back"
            logo={logo}
            stats={stats}
            sport={sport}
            backText={backText}
            physical={physical}
          />
        </div>
      </div>
    );
  } else if (product === 'wristbands') {
    thumb = (
      <div style={{ width: 156 }}>
        <WristbandPreview state={wristband} width={156} bandHeight={26} />
      </div>
    );
  } else if (product === 'keychains') {
    thumb = (
      <div style={{ width: 110, display: 'grid', placeItems: 'center' }}>
        {keychain.aiMode && keychain.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={keychain.aiImage} alt="" style={{ width: 110, height: 110, objectFit: 'contain', borderRadius: 12 }} />
        ) : (
          <KeychainPreview photo={photo} details={details} keychain={keychain} size={keychain.shape === 'circular' ? 110 : 96} />
        )}
      </div>
    );
  } else if (product === 'jewelry') {
    thumb = (
      <div style={{ width: 130, display: 'grid', placeItems: 'center' }}>
        {jewelry.aiMode && jewelry.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={jewelry.aiImage} alt="" style={{ width: 110, height: 110, objectFit: 'contain', borderRadius: 12 }} />
        ) : (
          <JewelryPreview jewelry={jewelry} size={jewelry.type === 'necklace' ? 110 : 90} />
        )}
      </div>
    );
  } else if (product === 'pins' || product === 'magnets') {
    const charm = product === 'pins' ? pin : magnet;
    thumb = (
      <div style={{ width: 100, display: 'grid', placeItems: 'center' }}>
        {charm.aiMode && charm.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={charm.aiImage} alt="" style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 12 }} />
        ) : (
          <PhotoCharmPreview
            charm={charm}
            photo={photo}
            details={details}
            kind={product === 'pins' ? 'pin' : 'magnet'}
            size={charm.shape === 'circular' ? 90 : 80}
          />
        )}
      </div>
    );
  } else if (product === 'plushies') {
    thumb = (
      <div style={{ width: 110, height: 110, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
        {plushie.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plushie.aiImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Icon name="plush" size={48} stroke={1.6} />
        )}
      </div>
    );
  } else if (product === 'bobbleheads') {
    thumb = (
      <div style={{ width: 110, height: 110, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
        {bobblehead.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bobblehead.aiImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Icon name="bobble" size={48} stroke={1.6} />
        )}
      </div>
    );
  } else {
    thumb = (
      <div style={{ width: 96, display: 'grid', placeItems: 'center' }}>
        <ProductMock product={product as 'posters' | 'stickers'} photo={photo} details={details} accent={accent} size={product === 'posters' ? 96 : 80} />
      </div>
    );
  }

  let detailLines: JSX.Element;
  if (product === 'wristbands') {
    const presetInfo = WRISTBAND_PRESETS.find((p) => p.id === wristband.band.preset);
    const bandColor = WRISTBAND_COLORS.find((c) => c.id === wristband.band.colorId);
    const patchColor = WRISTBAND_COLORS.find((c) => c.id === wristband.patch.colorId);
    const bandIsLogo = isLogoPreset(wristband.band.preset);
    detailLines = (
      <>
        Band: {bandColor?.name} · {presetInfo?.name}
        {wristband.band.text && !bandIsLogo && (<><br />&ldquo;{wristband.band.text}&rdquo;</>)}
        {bandIsLogo && (<><br />Custom logo</>)}
        <br />
        Patch: {patchColor?.name} · {
          wristband.patch.kind === 'brand' ? 'EMBLEM mark'
          : wristband.patch.kind === 'text' ? `"${wristband.patch.text || 'â'}"`
          : 'Custom logo'
        }
        <br />
        {size} · Qty {qty}
      </>
    );
  } else if (product === 'keychains') {
    const shape = KEYCHAIN_SHAPES.find((s) => s.id === keychain.shape);
    detailLines = (
      <>
        Shape: {keychain.aiMode ? 'Custom' : shape?.name}
        <br />
        {keychain.aiMode ? (
          <>{keychain.aiImage ? 'Custom render ready' : 'Custom render pending'}</>
        ) : (
          <>{details.name || 'Player'} · #{details.number || '00'} · {details.position}</>
        )}
        <br />
        Series 1 · {keychain.series} · Qty {qty}
      </>
    );
  } else if (product === 'jewelry') {
    const material = JEWELRY_MATERIALS.find((m) => m.id === jewelry.material);
    detailLines = (
      <>
        {jewelry.type === 'necklace' ? 'Necklace' : 'Bracelet'} · {
          jewelry.aiMode ? 'Custom' : jewelry.shape === 'circular' ? 'Circle' : 'Rectangle'
        }
        <br />
        {material?.name} stainless steel · 15+3cm
        <br />
        {jewelry.aiMode
          ? (jewelry.aiImage ? 'Custom render ready' : 'Custom render pending')
          : (jewelry.logo.processed || jewelry.logo.src ? 'Custom photo' : 'Blank â add a photo')}
        <br />
        Qty {qty}
      </>
    );
  } else if (product === 'pins' || product === 'magnets') {
    const charm = product === 'pins' ? pin : magnet;
    detailLines = (
      <>
        Shape: {charm.aiMode ? 'Custom' : charm.shape === 'circular' ? 'Circle' : 'Rectangle'}
        <br />
        {charm.aiMode
          ? (charm.aiImage ? 'Custom render ready' : 'Custom render pending')
          : (details.name ? `${details.name}${details.number ? ' #' + details.number : ''}` : 'No name plate')}
        <br />
        {size} · Qty {qty}
      </>
    );
  } else if (product === 'plushies') {
    const fabric = PLUSHIE_FABRICS.find((f) => f.id === plushie.fabric);
    detailLines = (
      <>
        6" plush keychain
        <br />
        Fabric: {fabric?.name}
        <br />
        {plushie.aiImage ? 'AI mockup ready · free proof first' : 'Custom render pending'}
        <br />
        Qty {qty}
      </>
    );
  } else if (product === 'bobbleheads') {
    detailLines = (
      <>
        7" hand-painted figurine
        <br />
        {bobblehead.modelUrl
          ? '3D model ready · ships in 3 weeks'
          : bobblehead.aiImage
            ? 'AI mockup ready · 3D model on order'
            : 'Custom render pending'}
        <br />
        Qty {qty}
      </>
    );
  } else {
    detailLines = (
      <>
        {details.name || 'Your Name'} · #{details.number || '00'}
        <br />
        {size} · Qty {qty}
      </>
    );
  }

  const row = (label: string, value: string, strong = false) => (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-manrope), system-ui',
        fontSize: strong ? 17 : 14.5, fontWeight: strong ? 800 : 500,
        color: strong ? 'var(--ink)' : 'var(--ink-soft)',
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: strong ? 'var(--font-sora), system-ui' : 'var(--font-jbmono), monospace' }}>{value}</span>
    </div>
  );

  const trust: [IconName, string][] = [
    ['shield', 'Secure checkout'],
    ['truck', 'Ships in 3–5 days'],
  ];

  return (
    <Screen >
      <Kicker title="Looks good?" sub="Review your order. NFC programming and free returns are always included." />

      {/* Discount / referral codes (multi) */}
      <div style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 12,
        background: referralCodes.length > 0 ? 'var(--accent-tint)' : 'var(--surface)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}>
        <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginBottom: 6, letterSpacing: '0.08em' }}>
          DISCOUNT CODES
        </Mono>

        {referralCodes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {referralCodes.map((c) => (
              <span
                key={c}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px 4px 10px',
                  borderRadius: 999,
                  background: '#fff',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-jbmono), monospace',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.06em',
                }}
              >
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => removeCode(c)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    padding: 0,
                    width: 16,
                    height: 16,
                    fontSize: 14,
                    lineHeight: '14px',
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={codeDraft}
            onChange={(e) => setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9_,\s-]/g, '').slice(0, 64))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder={atLimit ? `Max ${MAX_CODES} codes` : (referralCodes.length === 0 ? 'Enter code' : 'Add another code')}
            disabled={atLimit}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: atLimit ? 'var(--surface)' : '#fff',
              fontFamily: 'var(--font-jbmono), monospace',
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: '0.06em',
              color: 'var(--ink)',
              outline: 'none',
              opacity: atLimit ? 0.5 : 1,
            }}
          />
          {codeDraft && !atLimit && (
            <button
              type="button"
              onClick={addDraft}
              style={{
                border: '1px solid var(--accent)',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--font-jbmono), monospace',
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              ADD
            </button>
          )}
        </div>
        {referralCodes.length > 0 && (
          <Mono style={{ fontSize: 10, color: 'var(--accent)', marginTop: 8, letterSpacing: '0.06em' }}>
            ✓ {referralCodes.length === 1 ? '1 CODE' : `${referralCodes.length} CODES`} APPLIED AT CHECKOUT
          </Mono>
        )}
        {referralCodes.length === 0 && (
          <Mono style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 6, letterSpacing: '0.06em' }}>
            Press Enter or comma to add multiple codes
          </Mono>
        )}
      </div>

      <div
        style={{
          display: 'flex', gap: 16, alignItems: 'center',
          background: 'var(--surface)', borderRadius: 22, padding: 16,
          boxShadow: 'inset 0 0 0 1px var(--line)',
        }}
      >
        {thumb}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{pr.name}</div>
          {product === 'cards' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{template.family} · {template.theme}</Mono>)}
          {product === 'wristbands' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Elastic band · NFC patch</Mono>)}
          {product === 'keychains' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Acrylic · 3" · double-sided</Mono>)}
          {product === 'jewelry' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Stainless steel · adjustable chain</Mono>)}
          {product === 'pins' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Hard enamel · 1.25"</Mono>)}
          {product === 'magnets' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Photo magnet · vinyl laminate</Mono>)}
          {product === 'plushies' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Hand-sewn · 14-day turnaround</Mono>)}
          {product === 'bobbleheads' && (<Mono style={{ fontSize: 12, color: 'var(--ink-faint)' }}>3D printed · hand-painted</Mono>)}
          <div style={{ marginTop: 8, fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            {detailLines}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 20, padding: '0 4px' }}>
        {row('Subtotal', `$${sub}.00`)}
        {row('NFC programming', 'Included')}
        {row('Shipping', ship ? `$${ship}` : 'Free')}
        <div style={{ height: 1, background: 'var(--line)', margin: '2px 0' }} />
        {referralCodes.length > 0 ? (
          <>
            {row('Total before discount', `$${sub + ship}.00`)}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              paddingTop: 4,
            }}>
              <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
                Final total
              </span>
              <span style={{
                fontFamily: 'var(--font-jbmono), monospace',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.04em',
                color: 'var(--accent)',
                textAlign: 'right',
                lineHeight: 1.3,
              }}>
                Calculated at checkout
                <br />
                <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontWeight: 500, letterSpacing: '0.06em' }}>
                  {referralCodes.length === 1 ? '1 code applied' : `${referralCodes.length} codes applied`}
                </span>
              </span>
            </div>
          </>
        ) : (
          row('Total', `$${sub + ship}.00`, true)
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 22, padding: '16px 18px', borderRadius: 18, background: 'var(--accent-tint)' }}>
        {trust.map(([ic, tx]) => (
          <div key={tx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flex: 1, textAlign: 'center', color: 'var(--accent)' }}>
            <Icon name={ic} size={20} />
            <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.3 }}>{tx}</span>
          </div>
        ))}
      </div>

      <PrintFileBlock />
    </Screen>
  );
}
