'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import { fileToResizedDataUrl, generateRushmoreScene } from '../aiMockup';

const ModelViewer = dynamic(() => import('../ModelViewer'), { ssr: false });

export default function RushmoreEditScreen() {
  const { photo, rushmore, setRushmore, next } = useEmblem();
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // Poll Meshy when a job is running
  useEffect(() => {
    if (rushmore.status !== 'generating-3d' || !rushmore.meshyJobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/meshy/' + rushmore.meshyJobId);
        const data = await r.json();
        if (cancelled) return;
        if (data.status === 'SUCCEEDED' && data.modelUrls?.glb) {
          setRushmore({ status: 'ready-3d', modelUrl: data.modelUrls.glb, progress: 100 });
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          setRushmore({ status: 'ready-2d', error: 'Meshy job failed', meshyJobId: null });
        } else {
          setRushmore({ progress: data.progress ?? 0 });
          pollRef.current = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!cancelled) {
          setRushmore({ status: 'ready-2d', error: 'Polling failed', meshyJobId: null });
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [rushmore.status, rushmore.meshyJobId, setRushmore]);

  async function onSlotChange(slotIdx: 0 | 1 | 2, file: File | null) {
    if (!file) {
      const next: [string | null, string | null, string | null] = [...rushmore.extraPhotos] as [string | null, string | null, string | null];
      next[slotIdx] = null;
      setRushmore({ extraPhotos: next });
      return;
    }
    try {
      const data = await fileToResizedDataUrl(file);
      const next: [string | null, string | null, string | null] = [...rushmore.extraPhotos] as [string | null, string | null, string | null];
      next[slotIdx] = data;
      setRushmore({ extraPhotos: next });
    } catch (e) {
      // ignore
    }
  }

  async function runGenerateScene() {
    if (!photo) return;
    const all: string[] = [photo, ...rushmore.extraPhotos.filter((p): p is string => Boolean(p))];
    setRushmore({ status: 'generating', error: undefined, aiImage: null, modelUrl: null, meshyJobId: null });
    try {
      const { image } = await generateRushmoreScene(all);
      setRushmore({ aiImage: image, status: 'ready-2d', modelUrl: null, meshyJobId: null });
    } catch (e) {
      setRushmore({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  async function runGenerate3D() {
    if (!rushmore.aiImage) return;
    setRushmore({ status: 'generating-3d', error: undefined, progress: 0 });
    try {
      const r = await fetch('/api/meshy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: rushmore.aiImage }),
      });
      const data: { jobId?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok || !data.jobId) {
        setRushmore({
          status: 'ready-2d',
          error: data.error || '3D model will be generated when you order.',
        });
        return;
      }
      setRushmore({ meshyJobId: data.jobId });
    } catch (e) {
      setRushmore({
        status: 'ready-2d',
        error: e instanceof Error ? e.message : 'Meshy job kickoff failed',
      });
    }
  }

  const canReview = rushmore.aiImage !== null && (rushmore.status === 'ready-2d' || rushmore.status === 'ready-3d');
  const photoCount = 1 + rushmore.extraPhotos.filter(Boolean).length;

  return (
    <Screen
      footer={
        <Btn full kind="primary" icon="check" disabled={!canReview} onClick={next}>
          Continue to review
        </Btn>
      }
    >
      <Kicker title="Carve Mt Rushmore" sub="Up to 4 faces. Add family or teammates — or just go solo." />

      {/* Photo slots */}
      <Mono style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8, letterSpacing: '0.08em' }}>FACES ({photoCount}/4)</Mono>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {/* Slot 1: main photo (from upload step) */}
        <div style={{
          aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
          background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)',
          display: 'grid', placeItems: 'center', position: 'relative',
        }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Face 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Mono style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Slot 1</Mono>
          )}
          <div style={{
            position: 'absolute', top: 4, left: 4,
            background: 'var(--ink)', color: '#fff',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-jbmono), monospace', fontSize: 9,
          }}>1</div>
        </div>

        {/* Slots 2, 3, 4: optional extra uploads */}
        {[0, 1, 2].map((idx) => {
          const slotNum = idx + 2;
          const photoData = rushmore.extraPhotos[idx];
          const ref = fileRefs[idx];
          return (
            <div key={idx} style={{
              aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
              background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'grid', placeItems: 'center', position: 'relative',
              cursor: 'pointer',
            }} onClick={() => ref.current?.click()}>
              {photoData ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoData} alt={'Face ' + slotNum} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSlotChange(idx as 0 | 1 | 2, null); }}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 18, height: 18, borderRadius: 9,
                      background: 'rgba(0,0,0,0.65)', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      display: 'grid', placeItems: 'center',
                      fontSize: 12, lineHeight: 1,
                    }}
                  >×</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Icon name="plus" size={16} style={{ color: 'var(--ink-faint)' }} />
                  <Mono style={{ fontSize: 9, color: 'var(--ink-faint)' }}>Add</Mono>
                </div>
              )}
              <div style={{
                position: 'absolute', top: 4, left: 4,
                background: 'var(--ink)', color: '#fff',
                borderRadius: 4, padding: '1px 5px',
                fontFamily: 'var(--font-jbmono), monospace', fontSize: 9,
              }}>{slotNum}</div>
              <input
                ref={ref}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onSlotChange(idx as 0 | 1 | 2, f);
                  e.target.value = '';
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Generate scene button */}
      {rushmore.status !== 'generating' && rushmore.status !== 'generating-3d' && !rushmore.aiImage && (
        <button
          type="button"
          onClick={runGenerateScene}
          disabled={!photo}
          style={{
            width: '100%',
            border: 'none', cursor: 'pointer', background: 'var(--ink)',
            color: '#fff', borderRadius: 10, padding: '10px 14px',
            fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13.5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: 12,
            opacity: photo ? 1 : 0.5,
          }}
        >
          Carve the mountain
        </button>
      )}

      {/* Preview area */}
      <div style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--surface)',
        minHeight: 320,
        display: 'grid',
        placeItems: 'center',
        marginBottom: 16,
        position: 'relative',
      }}>
        {rushmore.status === 'generating' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 28 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <Mono style={{ fontSize: 12 }}>Carving the granite...</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~15-30 seconds</Mono>
          </div>
        ) : rushmore.status === 'error' ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {rushmore.error || 'Generation failed'}
            </div>
            <button
              type="button"
              onClick={runGenerateScene}
              style={{
                marginTop: 12, border: 'none', cursor: 'pointer',
                background: 'var(--ink)', color: '#fff', borderRadius: 10, padding: '8px 14px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
              }}
            >
              Try again
            </button>
          </div>
        ) : rushmore.modelUrl ? (
          <div style={{ width: '100%', height: 320 }}>
            <ModelViewer url={rushmore.modelUrl} />
          </div>
        ) : rushmore.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rushmore.aiImage} alt="Your Mt Rushmore" style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
        ) : (
          <Mono style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: 28 }}>
            Add photos above and click “Carve the mountain”
          </Mono>
        )}
        {rushmore.status === 'generating-3d' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <Mono style={{ fontSize: 12 }}>Sculpting 3D mountain... {rushmore.progress ?? 0}%</Mono>
          </div>
        )}
      </div>

      {/* 2D regen + 3D button */}
      {rushmore.aiImage && rushmore.status !== 'generating' && rushmore.status !== 'generating-3d' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={runGenerateScene}
            style={{
              flex: 1,
              border: 'none', cursor: 'pointer', background: 'var(--surface)',
              color: 'var(--ink)', borderRadius: 10, padding: '10px 14px',
              fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13.5,
              boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            Re-carve
          </button>
          {rushmore.status === 'ready-2d' && !rushmore.modelUrl && (
            <button
              type="button"
              onClick={runGenerate3D}
              style={{
                flex: 2,
                border: 'none', cursor: 'pointer', background: 'var(--ink)',
                color: '#fff', borderRadius: 10, padding: '10px 14px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13.5,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              Generate 3D print file
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Screen>
  );
}
