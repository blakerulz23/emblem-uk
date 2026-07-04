'use client';

import { useRef, useState } from 'react';
import { captureElementToPng, renderPrintFile, PrintProduct } from '@/lib/print-capture';

const SAMPLE_PHOTO = '/last-shot/caden-isaacs.png';

const PRODUCTS: { id: PrintProduct; label: string; w: number; h: number }[] = [
  { id: 'card',       label: 'Trading Card 2.5x3.5 double-sided', w: 280, h: 392 },
  { id: 'sticker',    label: 'Sticker 3x3',                       w: 280, h: 280 },
  { id: 'keychain',   label: 'Keychain 2.5x2.5',                  w: 280, h: 280 },
  { id: 'poster-sm',  label: 'Poster 11x17',                      w: 280, h: 432 },
  { id: 'poster-md',  label: 'Poster 18x24',                      w: 280, h: 373 },
  { id: 'poster-lg',  label: 'Poster 24x36',                      w: 280, h: 420 },
];

function SampleDesign({ photo, w, h }: { photo: string; w: number; h: number }) {
  return (
    <div
      data-print-target="true"
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1a1f2e 0%, #000 100%)',
        border: '2px solid #116DFF',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt="Sample"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.9) 100%)' }} />
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ background: '#116DFF', color: '#fff', padding: '4px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em' }}>LAST SHOT</span>
        <span style={{ fontSize: 42, color: '#fff', fontWeight: 800, lineHeight: 1 }}>#23</span>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
        <h3 style={{ fontSize: 26, color: '#fff', margin: 0, fontWeight: 800 }}>Caden Isaacs</h3>
        <p style={{ fontSize: 11, color: '#116DFF', margin: '6px 0 2px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Point Guard</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Westridge Wolves</p>
      </div>
    </div>
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)),
  ]);
}

export default function TestPrintPage() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [product, setProduct] = useState<PrintProduct>('card');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    if (!ref.current) return;
    setBusy(true);
    setError('');
    setDownloadUrl('');
    try {
      console.log('[print] starting capture');
      setStatus('Step 1 of 2: capturing design at 2x resolution');
      const dataUrl = await withTimeout(
        captureElementToPng(ref.current, { pixelRatio: 2, backgroundColor: '#000' }),
        30000,
        'design capture'
      );
      console.log('[print] capture done, PNG bytes:', dataUrl.length);

      setStatus('Step 2 of 2: uploading and generating PDF');
      const out = await withTimeout(
        renderPrintFile(product, dataUrl, {
          playerName: 'Caden Isaacs',
          teamName: 'Westridge Wolves',
          template: 'futuristic',
          orderRef: 'TEST-' + Date.now().toString(36),
        }),
        60000,
        'PDF upload'
      );
      console.log('[print] success:', out);
      setDownloadUrl(out.downloadUrl);
      const sizeKb = (out.bytes / 1024).toFixed(1);
      setStatus('Success: ' + sizeKb + ' KB PDF generated and uploaded');
    } catch (e: any) {
      console.error('[print] error:', e);
      const msg = e?.message || String(e) || 'unknown error';
      setError(msg);
      setStatus('Failed');
    } finally {
      setBusy(false);
    }
  };

  const cur = PRODUCTS.find((p) => p.id === product) || PRODUCTS[0];

  return (
    <main style={{ minHeight: '100vh', background: '#0a0e1a', color: '#fff', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, margin: '0 0 8px' }}>Print Pipeline Test</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 32px' }}>
          Captures design DOM, posts to /api/render-print, displays the resulting S3 PDF.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px' }}>Preview</h2>
            <div ref={ref}>
              <SampleDesign photo={SAMPLE_PHOTO} w={cur.w} h={cur.h} />
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px' }}>Output</h2>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'rgba(255,255,255,0.7)' }}>Product</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value as PrintProduct)}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, background: '#1a1f2e', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, marginBottom: 16 }}
            >
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <button
              onClick={onGenerate}
              disabled={busy}
              style={{ width: '100%', padding: '14px 24px', background: busy ? '#444' : '#116DFF', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Working...' : 'Generate Print File'}
            </button>

            {status && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: '16px 0 0', padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                {status}
              </p>
            )}

            {error && (
              <p style={{ fontSize: 13, color: '#ff7070', margin: '12px 0 0', padding: 12, background: 'rgba(255,0,0,0.08)', borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {error}
              </p>
            )}

            {downloadUrl && (
              <div style={{ marginTop: 16 }}>
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-block', padding: '12px 24px', background: '#1a6aff', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600 }}
                >
                  Download PDF
                </a>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '8px 0 0' }}>
                  Signed URL valid 7 days
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
