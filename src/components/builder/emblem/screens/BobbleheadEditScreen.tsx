'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Stepper, Mono } from '../primitives';
import Icon from '../Icon';
import { dataUrlToResized, fileToResizedDataUrl, generateAIMockup } from '../aiMockup';

const ModelViewer = dynamic(() => import('../ModelViewer'), { ssr: false });

const BOBBLE_INSPIRATION: Array<[string, string]> = [
  ['#FF5A1F', 'Maya'],
  ['#2563EB', 'Jordan'],
  ['#7c3aed', 'Sofia'],
  ['#16a34a', 'Diego'],
  ['#ec4899', 'Avery'],
  ['#1e3a8a', 'Riley'],
  ['#d97706', 'Cam'],
  ['#0ea5e9', 'Noah'],
];

export default function BobbleheadEditScreen() {
  const { photo, bobblehead, setBobblehead, qty, setQty, next } = useEmblem();
  const triedOnce = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-kick the Gemini 2D stylization on entry
  useEffect(() => {
    if (triedOnce.current) return;
    if (!photo) return;
    if (bobblehead.aiImage || bobblehead.status === 'generating') return;
    triedOnce.current = true;
    void runGenerate2D();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  // Poll Meshy when a job is running
  useEffect(() => {
    if (bobblehead.status !== 'generating-3d' || !bobblehead.meshyJobId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/meshy/${bobblehead.meshyJobId}`);
        const data: {
          status?: string;
          progress?: number;
          modelUrls?: { glb?: string } | null;
          error?: { message?: string } | null;
        } = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (data.status === 'SUCCEEDED' && data.modelUrls?.glb) {
          setBobblehead({
            status: 'ready-3d',
            modelUrl: `/api/proxy-model?url=${encodeURIComponent(data.modelUrls.glb)}`,
            progress: 100,
          });
          return;
        }
        if (data.status === 'FAILED') {
          setBobblehead({ status: 'error', error: data.error?.message || '3D generation failed' });
          return;
        }
        setBobblehead({ progress: data.progress ?? 0 });
        pollRef.current = setTimeout(tick, 4000);
      } catch {
        pollRef.current = setTimeout(tick, 5000);
      }
    };
    pollRef.current = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [bobblehead.status, bobblehead.meshyJobId, setBobblehead]);

  // First-time generation from the upfront flow's photo (auto-triggered on entry).
  async function runGenerate2D() {
    if (!photo) return;
    setBobblehead({ status: 'generating', error: undefined });
    try {
      const resized = await dataUrlToResized(photo);
      const { image } = await generateAIMockup(resized, 'bobblehead');
      setBobblehead({ aiImage: image, status: 'ready-2d', modelUrl: null, meshyJobId: null });
    } catch (e) {
      setBobblehead({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  // Regenerate uses a NEWLY uploaded photo.
  async function runGenerateFromFile(file: File) {
    setBobblehead({ status: 'generating', error: undefined, modelUrl: null, meshyJobId: null });
    try {
      const resized = await fileToResizedDataUrl(file);
      const { image } = await generateAIMockup(resized, 'bobblehead');
      setBobblehead({ aiImage: image, status: 'ready-2d' });
    } catch (e) {
      setBobblehead({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  async function runGenerate3D() {
    if (!bobblehead.aiImage) return;
    setBobblehead({ status: 'generating-3d', error: undefined, progress: 0 });
    try {
      const r = await fetch('/api/meshy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: bobblehead.aiImage }),
      });
      const data: { jobId?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok || !data.jobId) {
        // 503 from /api/meshy means the key isn't set — fall back gracefully
        setBobblehead({
          status: 'ready-2d',
          error: data.error || '3D model will be generated when you order.',
        });
        return;
      }
      setBobblehead({ meshyJobId: data.jobId });
    } catch (e) {
      setBobblehead({
        status: 'ready-2d',
        error: e instanceof Error ? e.message : 'Meshy job kickoff failed',
      });
    }
  }

  const canReview = bobblehead.aiImage !== null && (bobblehead.status === 'ready-2d' || bobblehead.status === 'ready-3d');

  return (
    <Screen
      footer={
        <Btn
          full
          kind="primary"
          iconR="chevR"
          onClick={() => next()}
          disabled={!canReview}
        >
          {canReview ? 'Review order' : 'Generating mockup…'}
        </Btn>
      }
    >
      <Kicker
        title="Their own collectible figurine."
        sub="We render an AI bobblehead preview, then 3D-print the final figurine on a small white base."
      />

      {/* Preview area: 3D when ready, else 2D image, else loading/error */}
      <div
        style={{
          position: 'relative',
          minHeight: 320,
          borderRadius: 22,
          background: '#fff',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {bobblehead.status === 'ready-3d' && bobblehead.modelUrl ? (
          <ModelViewer url={bobblehead.modelUrl} height={340} />
        ) : bobblehead.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bobblehead.aiImage}
            alt="Bobblehead preview"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : bobblehead.status === 'generating' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink-soft)', padding: 36 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 999,
                border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <Mono style={{ fontSize: 12 }}>Sculpting your bobblehead…</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~10–20 seconds</Mono>
          </div>
        ) : bobblehead.status === 'error' ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {bobblehead.error || 'Generation failed'}
            </div>
            <button
              type="button"
              onClick={runGenerate2D}
              style={{
                marginTop: 12, border: 'none', cursor: 'pointer',
                background: 'var(--ink)', color: '#fff', borderRadius: 10,
                padding: '8px 14px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13,
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={runGenerate2D}
            disabled={!photo}
            style={{
              border: 'none',
              cursor: photo ? 'pointer' : 'default',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 12,
              padding: '14px 22px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700, fontSize: 14,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 10px 24px var(--accent-glow)',
              opacity: photo ? 1 : 0.4,
            }}
          >
            <Icon name="sparkle" size={17} /> Generate bobblehead preview
          </button>
        )}

        {/* 3D-generation progress overlay */}
        {bobblehead.status === 'generating-3d' && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(4px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, color: 'var(--ink-soft)',
            }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: 999,
                border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <Mono style={{ fontSize: 12 }}>Building the 3D model… {bobblehead.progress ?? 0}%</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>Takes 1–3 minutes</Mono>
          </div>
        )}
      </div>

      {/* Hidden file input for "Regenerate with new photo" */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void runGenerateFromFile(f);
          e.target.value = '';
        }}
      />

      {/* Action row */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {bobblehead.aiImage && bobblehead.status !== 'generating' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              border: 'none', cursor: 'pointer', background: 'var(--surface)',
              color: 'var(--ink)', borderRadius: 10, padding: '8px 14px',
              fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
              boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="upload" size={14} /> Regenerate with new photo
          </button>
        )}
        {bobblehead.status === 'ready-2d' && !bobblehead.modelUrl && (
          <button
            type="button"
            onClick={runGenerate3D}
            style={{
              border: 'none', cursor: 'pointer', background: 'var(--ink)',
              color: '#fff', borderRadius: 10, padding: '8px 14px',
              fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="bobble" size={14} /> See it in 3D
          </button>
        )}
      </div>

      {/* Note about 3D fallback (visible after a 2D-ready state with an error hint about Meshy) */}
      {bobblehead.status === 'ready-2d' && bobblehead.error && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--accent-tint)',
            color: 'var(--ink-soft)',
            fontFamily: 'var(--font-manrope), system-ui',
            fontSize: 12.5,
            lineHeight: 1.4,
          }}
        >
          {bobblehead.error}
        </div>
      )}

      {/* Quantity */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Quantity
          </Mono>
          <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            7" figurine · hand-painted · 3-week build
          </Mono>
        </div>
        <Stepper value={qty} onChange={setQty} />
      </div>

      {/* Inspiration */}
      <div style={{ marginTop: 32, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            See it on
          </Mono>
          <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-faint)' }}>
            Past commissions
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
                {BOBBLE_INSPIRATION.map(([accent, name], i) => (
                  <div
                    key={`${dup}-${i}`}
                    style={{
                      flex: '0 0 132px',
                      aspectRatio: '4 / 5',
                      borderRadius: 16,
                      background: `radial-gradient(120% 100% at 50% 0%, #f3f3f7 0%, #e8e8ee 60%, #c8c8d0 100%)`,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(11,11,15,.18)',
                    }}
                  >
                    <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
                      <ellipse cx="50" cy="110" rx="30" ry="6" fill="rgba(0,0,0,0.1)" />
                      <circle cx="50" cy="50" r="22" fill={accent} />
                      <ellipse cx="50" cy="92" rx="14" ry="20" fill={accent} />
                      <circle cx="44" cy="48" r="3" fill="#0b0b0f" />
                      <circle cx="56" cy="48" r="3" fill="#0b0b0f" />
                      <path d="M44 58 Q50 62 56 58" fill="none" stroke="#0b0b0f" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <div
                      style={{
                        position: 'absolute', left: 10, bottom: 10,
                        color: '#0b0b0f',
                        fontFamily: 'var(--font-sora), system-ui',
                        fontWeight: 700, fontSize: 13,
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
