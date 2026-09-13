'use client';

/**
 * DEV-ONLY diagnostic page — not linked from anywhere in the product.
 * Exists to answer one question with evidence instead of assumption:
 * does html2canvas reproduce the exact object-fit/object-position/
 * transform/clip-path combination CardArt's photo layer uses, the same
 * way the real browser (what Emblem OS's viewer sees) does?
 *
 * Renders the identical CardFace/CardArt component tree Emblem OS and
 * the print-capture rig both use, with a fixture matching the shape of
 * a real Custom Collection card (not any real customer's data), then
 * exposes both:
 *  - the native, real-browser-rendered element (Playwright can screenshot
 *    this directly — ground truth, same engine a guardian's browser uses)
 *  - an html2canvas capture of that same element, using the exact params
 *    the production print-capture path uses (pixelRatio 3, white bg)
 * side by side so the two can be compared pixel-for-pixel.
 */

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CardFace, type CardFaceData } from '@/lib/card-definition';
import { captureElementToPng } from '@/lib/print-capture';

const CARD_SIZE = 340;

export default function PhotoCropTestPage() {
  return (
    <Suspense fallback={null}>
      <PhotoCropTestInner />
    </Suspense>
  );
}

/**
 * Fixture is overridable via query params so this one page serves both the
 * generic html2canvas-vs-native reproducibility check and, when needed, a
 * comparison render matching a specific real card's *non-sensitive* saved
 * fields (template/crop/name/position/number/team) — never a real photo or
 * any private data, since this page is never linked from the product.
 * ?templateId=&name=&position=&number=&team=&cropX=&cropY=&cropScale=&logo=&photo=&naturalWidth=&naturalHeight=
 * naturalWidth/naturalHeight are the fixture photo's own real pixel size —
 * required to exercise computePhotoGeometry's below-scale-1 reveal-more
 * branch (photo-geometry.ts), since that branch only activates once a
 * photo's natural size is known (CardArt is also rendered server-side,
 * where nothing can measure an <img> to discover it on its own).
 */
function PhotoCropTestInner() {
  const params = useSearchParams();
  const fixture: CardFaceData = {
    templateId: params.get('templateId') || 'custom-galaxy',
    sport: 'soccer',
    name: params.get('name') || 'Test Player',
    number: params.get('number') || '10',
    team: params.get('team') || 'Custom Collection',
    position: params.get('position') || 'RB',
    // Explicit ?logo= (empty) means "no badge" (Emblem OS's logo:null case) —
    // distinct from omitting the param, which defaults to the print
    // placeholder. params.get() alone can't distinguish those two cases.
    logo: params.has('logo') ? params.get('logo') : '/templates/custom-collection/custom-logo-placeholder.png',
    photoCrop: {
      x: Number(params.get('cropX') ?? 8),
      y: Number(params.get('cropY') ?? -4),
      scale: Number(params.get('cropScale') ?? 0.8),
    },
    stats: { apps: '', goals: '', assists: '' },
    photoNaturalWidth: params.has('naturalWidth') ? Number(params.get('naturalWidth')) : undefined,
    photoNaturalHeight: params.has('naturalHeight') ? Number(params.get('naturalHeight')) : undefined,
  };
  const fixturePhoto = params.get('photo') || '/last-shot/caden-isaacs.png';
  const nativeFrontRef = useRef<HTMLDivElement>(null);
  const nativeBackRef = useRef<HTMLDivElement>(null);
  // Separate refs for the print-style (forPrint, borderRadius:0) render —
  // ProductionBuilder.tsx's own print-capture rig renders a SEPARATE
  // off-screen tree with forPrint set, not the same element share capture
  // reads, so this harness reproduces that distinction rather than
  // capturing one shared element two different ways.
  const printFrontRef = useRef<HTMLDivElement>(null);
  const printBackRef = useRef<HTMLDivElement>(null);
  const [capturedShareFront, setCapturedShareFront] = useState<string | null>(null);
  const [capturedShareBack, setCapturedShareBack] = useState<string | null>(null);
  const [capturedPrintFront, setCapturedPrintFront] = useState<string | null>(null);
  const [capturedPrintBack, setCapturedPrintBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Exact params captureShareImageFor (ProductionBuilder.tsx) uses. */
  const runShareCapture = async () => {
    if (!nativeFrontRef.current) return;
    setBusy(true);
    try {
      const front = await captureElementToPng(nativeFrontRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      setCapturedShareFront(front);
      if (nativeBackRef.current) {
        const back = await captureElementToPng(nativeBackRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
        setCapturedShareBack(back);
      }
    } finally {
      setBusy(false);
    }
  };

  /** Exact params ProductionBuilder.tsx's print-capture rig uses:
   *  pixelRatio 3 on a forPrint (borderRadius:0) element. */
  const runPrintCapture = async () => {
    if (!printFrontRef.current) return;
    setBusy(true);
    try {
      const front = await captureElementToPng(printFrontRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      setCapturedPrintFront(front);
      if (printBackRef.current) {
        const back = await captureElementToPng(printBackRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
        setCapturedPrintBack(back);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif', background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20 }}>Photo crop parity — dev diagnostic</h1>
      <p style={{ opacity: 0.7, maxWidth: 640 }}>
        Fixture: templateId={fixture.templateId}, crop=&#123;x:{fixture.photoCrop?.x}, y:{fixture.photoCrop?.y}, scale:{fixture.photoCrop?.scale}&#125;. Not linked from the product — for automated comparison only.
      </p>

      <div style={{ display: 'flex', gap: 40, marginTop: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6 }}>Native browser render — front</h2>
          <div ref={nativeFrontRef} data-testid="native-card-front" style={{ width: CARD_SIZE }}>
            <CardFace data={fixture} side="front" size={CARD_SIZE} photoUrl={fixturePhoto} />
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6 }}>Native browser render — back</h2>
          <div ref={nativeBackRef} data-testid="native-card-back" style={{ width: CARD_SIZE }}>
            <CardFace data={fixture} side="back" size={CARD_SIZE} photoUrl={fixturePhoto} />
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6 }}>Share capture (pixelRatio 2, rounded — captureShareImageFor&apos;s own params)</h2>
          <button
            type="button"
            data-testid="share-capture-btn"
            onClick={runShareCapture}
            disabled={busy}
            style={{ padding: '10px 16px', marginBottom: 12, background: '#e97435', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Capturing…' : 'Run share-style captureElementToPng'}
          </button>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: CARD_SIZE }}>
              {capturedShareFront ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-testid="share-result-front" src={capturedShareFront} alt="share capture front result" style={{ width: '100%', display: 'block' }} />
              ) : (
                <div style={{ width: CARD_SIZE, height: Math.round(CARD_SIZE * 1.4), background: '#222', display: 'grid', placeItems: 'center', fontSize: 12, opacity: 0.5 }}>
                  Not captured yet
                </div>
              )}
            </div>
            <div style={{ width: CARD_SIZE }}>
              {capturedShareBack ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-testid="share-result-back" src={capturedShareBack} alt="share capture back result" style={{ width: '100%', display: 'block' }} />
              ) : (
                <div style={{ width: CARD_SIZE, height: Math.round(CARD_SIZE * 1.4), background: '#222', display: 'grid', placeItems: 'center', fontSize: 12, opacity: 0.5 }}>
                  Not captured yet
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6 }}>Print-style render (forPrint, square corners) — same tree ProductionBuilder&apos;s print-capture rig renders off-screen</h2>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div ref={printFrontRef} data-testid="print-native-front" style={{ width: CARD_SIZE }}>
              <CardFace data={fixture} side="front" size={CARD_SIZE} photoUrl={fixturePhoto} style={{ borderRadius: 0 }} />
            </div>
            <div ref={printBackRef} data-testid="print-native-back" style={{ width: CARD_SIZE }}>
              <CardFace data={fixture} side="back" size={CARD_SIZE} photoUrl={fixturePhoto} style={{ borderRadius: 0 }} />
            </div>
          </div>
          <button
            type="button"
            data-testid="print-capture-btn"
            onClick={runPrintCapture}
            disabled={busy}
            style={{ padding: '10px 16px', marginBottom: 12, background: '#116DFF', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Capturing…' : 'Run print-style captureElementToPng (pixelRatio 3, forPrint)'}
          </button>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: CARD_SIZE }}>
              {capturedPrintFront ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-testid="print-result-front" src={capturedPrintFront} alt="print capture front result" style={{ width: '100%', display: 'block' }} />
              ) : (
                <div style={{ width: CARD_SIZE, height: Math.round(CARD_SIZE * 1.4), background: '#222', display: 'grid', placeItems: 'center', fontSize: 12, opacity: 0.5 }}>
                  Not captured yet
                </div>
              )}
            </div>
            <div style={{ width: CARD_SIZE }}>
              {capturedPrintBack ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-testid="print-result-back" src={capturedPrintBack} alt="print capture back result" style={{ width: '100%', display: 'block' }} />
              ) : (
                <div style={{ width: CARD_SIZE, height: Math.round(CARD_SIZE * 1.4), background: '#222', display: 'grid', placeItems: 'center', fontSize: 12, opacity: 0.5 }}>
                  Not captured yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
