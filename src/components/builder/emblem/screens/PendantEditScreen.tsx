'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import { dataUrlToResized, generateAIMockup } from '../aiMockup';

const ModelViewer = dynamic(() => import('../ModelViewer'), { ssr: false });

export default function PendantEditScreen() {
  const { photo, pendant, setPendant, next } = useEmblem();
  const triedOnce = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-kick the Gemini 2D step the first time we land here with a photo
  useEffect(() => {
    if (triedOnce.current) return;
    if (!photo) return;
    if (pendant.aiImage || pendant.status !== 'idle') return;
    triedOnce.current = true;
    runGenerate2D();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  // Poll Meshy when a job is running
  useEffect(() => {
    if (pendant.status !== 'generating-3d' || !pendant.meshyJobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/meshy/' + pendant.meshyJobId);
        const data = await r.json();
        if (cancelled) return;
        if (data.status === 'SUCCEEDED' && data.modelUrls?.glb) {
          setPendant({ status: 'ready-3d', modelUrl: data.modelUrls.glb, progress: 100 });
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          setPendant({ status: 'ready-2d', error: 'Meshy job failed', meshyJobId: null });
        } else {
          setPendant({ progress: data.progress ?? 0 });
          pollRef.current = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!cancelled) {
          setPendant({ status: 'ready-2d', error: 'Polling failed', meshyJobId: null });
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [pendant.status, pendant.meshyJobId, setPendant]);

  async function runGenerate2D() {
    if (!photo) return;
    setPendant({ status: 'generating', error: undefined, aiImage: null, modelUrl: null, meshyJobId: null });
    try {
      const resized = await dataUrlToResized(photo);
      const { image } = await generateAIMockup(resized, 'pendant');
      setPendant({ aiImage: image, status: 'ready-2d', modelUrl: null, meshyJobId: null });
    } catch (e) {
      setPendant({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  async function runGenerate3D() {
    if (!pendant.aiImage) return;
    setPendant({ status: 'generating-3d', error: undefined, progress: 0 });
    try {
      const r = await fetch('/api/meshy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: pendant.aiImage }),
      });
      const data: { jobId?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok || !data.jobId) {
        setPendant({
          status: 'ready-2d',
          error: data.error || '3D model will be generated when you order.',
        });
        return;
      }
      setPendant({ meshyJobId: data.jobId });
    } catch (e) {
      setPendant({
        status: 'ready-2d',
        error: e instanceof Error ? e.message : 'Meshy job kickoff failed',
      });
    }
  }

  const canReview = pendant.aiImage !== null && (pendant.status === 'ready-2d' || pendant.status === 'ready-3d');

  return (
    <Screen
      footer={
        <Btn full kind="primary" icon="check" disabled={!canReview} onClick={next}>
          Continue to review
        </Btn>
      }
    >
      <Kicker title="Carve your cameo" sub="Classical side-profile pendant in carved stone — ready for casting." />

      {/* Re-generate button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          onClick={runGenerate2D}
          disabled={pendant.status === 'generating' || pendant.status === 'generating-3d'}
          style={{
            border: 'none', cursor: 'pointer', background: 'var(--surface)',
            color: 'var(--ink)', borderRadius: 10, padding: '8px 14px',
            fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
            boxShadow: 'inset 0 0 0 1px var(--line)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: (pendant.status === 'generating' || pendant.status === 'generating-3d') ? 0.5 : 1,
          }}
        >
          <Icon name="upload" size={14} /> Re-generate
        </button>
      </div>

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
        {pendant.status === 'generating' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 28 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <Mono style={{ fontSize: 12 }}>Carving your cameo...</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~10-20 seconds</Mono>
          </div>
        ) : pendant.status === 'error' ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {pendant.error || 'Generation failed'}
            </div>
            <button
              type="button"
              onClick={runGenerate2D}
              style={{
                marginTop: 12, border: 'none', cursor: 'pointer',
                background: 'var(--ink)', color: '#fff', borderRadius: 10, padding: '8px 14px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
              }}
            >
              Try again
            </button>
          </div>
        ) : pendant.modelUrl ? (
          <div style={{ width: '100%', height: 320 }}>
            <ModelViewer url={pendant.modelUrl} />
          </div>
        ) : pendant.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pendant.aiImage} alt="Your cameo pendant" style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
        ) : (
          <Mono style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Upload a photo to begin</Mono>
        )}
        {pendant.status === 'generating-3d' && (
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
            <Mono style={{ fontSize: 12 }}>Sculpting 3D pendant... {pendant.progress ?? 0}%</Mono>
          </div>
        )}
      </div>

      {/* 3D button */}
      {pendant.status === 'ready-2d' && !pendant.modelUrl && (
        <button
          type="button"
          onClick={runGenerate3D}
          style={{
            width: '100%',
            border: 'none', cursor: 'pointer', background: 'var(--ink)',
            color: '#fff', borderRadius: 10, padding: '10px 14px',
            fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13.5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: 8,
          }}
        >
          Generate 3D print file
        </button>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Screen>
  );
}
