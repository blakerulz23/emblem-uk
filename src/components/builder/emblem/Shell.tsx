'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEmblem } from '@/context/EmblemContext';
import Icon from './Icon';
import { Btn, Mono } from './primitives';
import { STEP_NAME, PRODUCTS } from './data';
import UploadScreen from './screens/UploadScreen';
import MagicScreen from './screens/MagicScreen';
import ProductScreen from './screens/ProductScreen';
import GalleryScreen from './screens/GalleryScreen';
import EditScreen from './screens/EditScreen';
import WristbandEditScreen from './screens/WristbandEditScreen';
import KeychainEditScreen from './screens/KeychainEditScreen';
import JewelryEditScreen from './screens/JewelryEditScreen';
import PinMagnetEditScreen from './screens/PinMagnetEditScreen';
import PlushieEditScreen from './screens/PlushieEditScreen';
import PendantEditScreen from './screens/PendantEditScreen';
import BobbleheadEditScreen from './screens/BobbleheadEditScreen';
import ArmyManEditScreen from './screens/ArmyManEditScreen';
import RushmoreEditScreen from './screens/RushmoreEditScreen';
import ReviewScreen from './screens/ReviewScreen';

export default function BuilderShell() {
  const { step, dir, index, steps, pct, cart, back, reset, success, setSuccess, go, product, photo } =
    useEmblem();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLastShot = searchParams?.get('from') === 'lastshot';

  // "In the middle of an upload" = anything past the very first screen OR a photo
  // already chosen on the first screen.
  const hasProgress = index > 0 || photo !== null;

  const handleLogoClick = () => {
    if (hasProgress) {
      const ok = window.confirm(
        "You'll lose your current design if you leave this page. Continue to home?",
      );
      if (!ok) return;
    }
    reset();
    router.push('/');
  };

  let editScreen;
  if (product === 'wristbands') editScreen = <WristbandEditScreen />;
  else if (product === 'keychains') editScreen = <KeychainEditScreen />;
  else if (product === 'jewelry') editScreen = <JewelryEditScreen />;
  else if (product === 'pins') editScreen = <PinMagnetEditScreen kind="pin" />;
  else if (product === 'magnets') editScreen = <PinMagnetEditScreen kind="magnet" />;
  else if ((product === 'plushies' || product === 'figurinez' || product === 'coins')) editScreen = <PlushieEditScreen />;
  else if (product === 'pendants') editScreen = <PendantEditScreen />;
  else if (product === 'bobbleheads') editScreen = <BobbleheadEditScreen />;
  else if (product === 'armymen') editScreen = <ArmyManEditScreen />;
  else if (product === 'rushmore') editScreen = <RushmoreEditScreen />;
  else editScreen = <EditScreen />;

  const screenMap = {
    upload: <UploadScreen />,
    magic: <MagicScreen />,
    product: <ProductScreen />,
    gallery: <GalleryScreen />,
    edit: editScreen,
    review: <ReviewScreen />,
  } as const;

  const productName = PRODUCTS.find((p) => p.id === product)?.name.toLowerCase() || 'order';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 0 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          minHeight: '100dvh',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 0 0 1px var(--line)',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 6,
            background: 'rgba(255,255,255,.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', height: 56, boxSizing: 'border-box' }}>
            <div style={{ width: 40 }}>
              {index > 0 && (
                <button
                  type="button"
                  onClick={back}
                  aria-label="Back"
                  style={{ width: 40, height: 40, marginLeft: -8, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}
                >
                  <Icon name="chevL" size={22} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleLogoClick}
              aria-label="Go to home"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 13, height: 13, background: 'var(--accent)', borderRadius: 3, transform: 'rotate(45deg)', boxShadow: '0 2px 8px var(--accent-glow)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, letterSpacing: '0.04em', color: 'var(--ink)' }}>{isLastShot ? 'LAST SHOT' : 'EMBLEM'}</span>
            </button>
            <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" aria-label="Cart" onClick={() => { if (cart > 0) { go('review'); } else { window.open('https://officialgudzzz.myshopify.com/cart', '_blank'); } }} style={{ position: 'relative', width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
                <Icon name="cart" size={21} />
                {cart > 0 && (
                  <span style={{ position: 'absolute', top: 3, right: 2, minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box', background: 'var(--accent)', color: '#fff', borderRadius: 999, fontFamily: 'var(--font-jbmono), monospace', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{cart}</span>
                )}
              </button>
            </div>
          </div>
          <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .4s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            <Mono style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
              {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')} · {STEP_NAME[step]}
            </Mono>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
          <div key={step} className={dir > 0 ? 'screen-enter' : 'screen-enter-back'} style={{ position: 'absolute', inset: 0 }}>
            {screenMap[step]}
          </div>
        </div>

        {success && (
          <div
            className="screen-enter"
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 32, textAlign: 'center',
            }}
          >
            <div className="pop" style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 16px 40px var(--accent-glow)' }}>
              <Icon name="check" size={42} stroke={2.4} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '22px 0 6px' }}>
              Added to cart
            </h2>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', maxWidth: 260, lineHeight: 1.45, margin: 0 }}>
              Your {productName} are saved. Add another product with the same photo, or check out.
            </p>
            <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 280, marginTop: 28 }}>
              <Btn full kind="primary" icon="cart" onClick={() => { setSuccess(false); setTimeout(() => (document.querySelector('[data-action=buy-on-shopify]') as HTMLButtonElement | null)?.click(), 50); }}>
                Check out on Shopify
              </Btn>
              <Btn full kind="ghost" icon="plus" onClick={() => { setSuccess(false); go('product', 1); }}>
                Make another product
              </Btn>
              <Btn full kind="ghost" onClick={reset}>
                Start over
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
