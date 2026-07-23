'use client';

import { useRef, useState } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import ProductArt from './ProductArt';
import CardArt from './CardArt';
import { captureElementToPng, renderPrintFile, PrintProduct } from '@/lib/print-capture';
import { buildCartUrl, PUZZLE_VARIANT_BY_STYLE, SHOPIFY_SHOP } from '@/lib/shopify';
import { type ProductId } from './data';

const PRODUCT_MAP: Partial<Record<ProductId, PrintProduct>> = {
  cards: 'card',
  stickers: 'sticker',
  keychains: 'keychain',
  puzzles: 'puzzle',
  // 'posters' handled via posterSize state
};

type PosterSize = 'poster-sm' | 'poster-md' | 'poster-lg';
const POSTER_SIZES: { id: PosterSize; label: string; dim: string }[] = [
  { id: 'poster-sm', label: 'Small',  dim: '11 x 17' },
  { id: 'poster-md', label: 'Medium', dim: '18 x 24' },
  { id: 'poster-lg', label: 'Large',  dim: '24 x 36' },
];

export default function PrintFileBlock() {
  const ctx = useEmblem() as any;
  const product: ProductId = ctx.product;
  const template = ctx.template;
  const photo = ctx.photo;
  const details = ctx.details;
  const photoScale = ctx.photoScale;
  const photoOffsetX = ctx.photoOffsetX;
  const photoOffsetY = ctx.photoOffsetY;
  const keychainShape = ctx.keychain?.shape;
  const referralCode = ctx.referralCode as string | null | undefined;
  const referralCodes = (ctx.referralCodes as string[] | undefined) ?? (referralCode ? [referralCode] : []);
  const puzzleStyle = ctx.puzzle?.style;
  const charmShape = ctx.charm?.shape;

  const hiddenRef = useRef<HTMLDivElement | null>(null);
  const hiddenBackRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [posterSize, setPosterSize] = useState<PosterSize>('poster-md');
  const [purchaserEmail, setPurchaserEmail] = useState('');

  const printProduct: PrintProduct | undefined = product === 'posters' ? posterSize : PRODUCT_MAP[product];
  if (!printProduct) return null;

  /**
   * Capture the hidden design, render to PDF on S3, return the key + signed
   * URL. Takes the caller's orderRef rather than generating its own — one
   * ref, generated once by the caller, reused for the PDF metadata, the
   * orders row, and the Shopify cart attribute (closes Checkout Phase 0
   * defect #1 for this path, matching how the team-order builder already
   * does it).
   */
  const generate = async (orderRef: string): Promise<{ key: string; downloadUrl: string } | null> => {
    if (!hiddenRef.current) return null;
    setStatus('Step 1 of 2: capturing your design');
    const dataUrl = await captureElementToPng(hiddenRef.current, { pixelRatio: 2, backgroundColor: '#fff' });
    setStatus('Step 2 of 2: uploading and generating print PDF');
    let backDataUrl: string | undefined;
    if (printProduct === 'card' && hiddenBackRef.current) {
      backDataUrl = await captureElementToPng(hiddenBackRef.current);
    }
    const out = await renderPrintFile(printProduct, dataUrl, {
      playerName: details?.playerName || details?.name,
      teamName: details?.teamName || details?.team,
      template: template?.name || template?.family,
      orderRef,
    }, backDataUrl);
    return { key: out.key, downloadUrl: out.downloadUrl };
  };

  const onPreview = async () => {
    setBusy(true); setError(''); setDownloadUrl('');
    try {
      const out = await generate('BUILDER-' + Date.now().toString(36));
      if (out) {
        setDownloadUrl(out.downloadUrl);
        setStatus('Print file ready');
      }
    } catch (e: any) {
      setError(e?.message || 'unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onBuy = async () => {
    const email = purchaserEmail.trim();
    if (printProduct === 'card' && !/\S+@\S+\.\S+/.test(email)) {
      setError('Enter the email you’re buying with before checking out');
      return;
    }

    setBusy(true); setError(''); setDownloadUrl('');
    try {
      const orderRef = 'BUILDER-' + Date.now().toString(36);
      const out = await generate(orderRef);
      if (!out) throw new Error('failed to generate print file');
      const url = out.downloadUrl;
      setStatus('Redirecting to checkout');
      const playerName = details?.playerName || details?.name;

      if (printProduct === 'card') {
        // Persist an order/player intent before the Shopify redirect — this
        // is the only server-side moment this standalone path has, since
        // checkout itself is a plain cart-permalink redirect with no
        // webhook back to this app. See src/app/api/orders/intent/route.ts.
        try {
          await fetch('/api/orders/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderRef,
              purchaserEmail: email,
              playerName,
              printFiles: [{ playerName, key: out.key }],
            }),
          });
        } catch {
          // Never block checkout on this — the no-card recovery flow is a
          // fallback; a failure here just means that fallback won't find
          // this particular order later.
        }
      }

      let cartUrl = buildCartUrl(printProduct, {
        printFileUrl: url,
        playerName,
        teamName: details?.teamName || details?.team,
        template: template?.name || template?.family,
        posterSize: product === 'posters' ? POSTER_SIZES.find(s => s.id === posterSize)?.dim : undefined,
        orderRef,
        discountCodes: referralCodes.length > 0 ? referralCodes : undefined,
      });
      if (product === 'puzzles' && puzzleStyle) {
        const variantId = PUZZLE_VARIANT_BY_STYLE[puzzleStyle as 'photo' | 'card'];
        cartUrl = cartUrl.replace(/\/cart\/\d+:/, '/cart/' + variantId + ':');
      }
      window.location.href = cartUrl;
    } catch (e: any) {
      setError(e?.message || 'unknown error');
      setBusy(false);
    }
  };

  return (
    <>
      {/* Hidden full-size render for capture */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        <div ref={hiddenRef} style={{ background: '#000', padding: 0 }}>
          <ProductArt
            product={product}
            template={template}
            photo={photo}
            details={details}
            size={700}
            keychainShape={keychainShape}
            charmShape={charmShape}
            photoScale={photoScale}
            photoOffsetX={photoOffsetX}
            photoOffsetY={photoOffsetY}
          />
        </div>
        {printProduct === 'card' && (
          <div ref={hiddenBackRef} style={{ background: '#000', padding: 0, marginTop: 20 }}>
            <CardArt
              template={template}
              photo={photo}
              details={details}
              size={700}
              side="back"
            />
          </div>
        )}
      </div>

      {/* Visible UI */}
      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 14,
          background: 'var(--surface)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14, color: 'var(--ink)', letterSpacing: '0.02em' }}>
            Order
          </span>
          <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, color: 'var(--ink-faint)' }}>
            300 DPI print + Shopify checkout
          </span>
        </div>

        {product === 'posters' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {POSTER_SIZES.map((s) => {
              const active = s.id === posterSize;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPosterSize(s.id)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    background: active ? 'var(--accent-tint)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--ink-soft)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                    borderRadius: 8,
                    fontFamily: 'var(--font-sora), system-ui',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  <div>{s.label}</div>
                  <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{s.dim}</div>
                </button>
              );
            })}
          </div>
        )}

        {printProduct === 'card' && (
          <input
            type="email"
            value={purchaserEmail}
            onChange={(e) => setPurchaserEmail(e.target.value)}
            placeholder="Your email (for order confirmation)"
            aria-label="Purchaser email"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              marginBottom: 10,
              borderRadius: 8,
              border: '1px solid var(--line)',
              fontFamily: 'var(--font-manrope), system-ui',
              fontSize: 14,
              color: 'var(--ink)',
              background: 'var(--paper)',
            }}
          />
        )}

        <button
          type="button"
          onClick={onBuy}
          data-action="buy-on-shopify"
          disabled={busy}
          style={{
            width: '100%',
            padding: '14px 16px',
            background: busy ? 'var(--line)' : 'var(--accent)',
            color: busy ? 'var(--ink-faint)' : '#fff',
            border: 'none',
            borderRadius: 10,
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Working...' : 'NEXT STEP'}
        </button>

        

        {status && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 0', fontFamily: 'var(--font-manrope), system-ui' }}>
            {status}
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: '#c43a3a', margin: '8px 0 0', fontFamily: 'var(--font-jbmono), monospace', wordBreak: 'break-all' }}>
            {error}
          </p>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              marginTop: 10,
              padding: '10px 16px',
              background: 'var(--ink)',
              color: 'var(--paper)',
              textDecoration: 'none',
              borderRadius: 8,
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.02em',
            }}
          >
            Download Preview PDF
          </a>
        )}
      </div>
    </>
  );
}
