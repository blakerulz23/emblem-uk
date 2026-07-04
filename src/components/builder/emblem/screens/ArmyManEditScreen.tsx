'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import Icon from '../Icon';
import { dataUrlToResized, generateAIMockup } from '../aiMockup';
import type { ArmyManPose, ArmyManColor } from '../data';

const ModelViewer = dynamic(() => import('../ModelViewer'), { ssr: false });

const POSES: Array<{ id: ArmyManPose; label: string }> = [
  { id: 'rifle',    label: 'Rifle aim' },
  { id: 'kneeling', label: 'Kneeling' },
  { id: 'running',  label: 'Running' },
  { id: 'radio',    label: 'Radio op' },
];

const COLORS: Array<{ id: ArmyManColor; label: string; hex: string }> = [
  { id: 'green', label: 'Army Green', hex: '#5b6f3c' },
  { id: 'tan',   label: 'Desert Tan', hex: '#c9a97b' },
  { id: 'gray',  label: 'Winter Gray', hex: '#8a8e94' },
];

export default function ArmyManEditScreen() {
  const { photo, armyman, setArmyman, next } = useEmblem();
  const triedOnce = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-kick the Gemini 2D step the first time we land here with a photo
  useEffect(() => {
    if (triedOnce.current) return;
    if (!photo) return;
    if (armyman.aiImage || armyman.status !== 'idle') return;
    triedOnce.current = true;
    runGenerate2D();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  // Poll Meshy when a job is running
  useEffect(() => {
    if (armyman.status !== 'generating-3d' || !armyman.meshyJobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/meshy/' + armyman.meshyJobId);
        const data = await r.json();
        if (cancelled) return;
        if (data.status === 'SUCCEEDED' && data.modelUrls?.glb) {
          setArmyman({ status: 'ready-3d', modelUrl: data.modelUrls.glb, progress: 100 });
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          setArmyman({ status: 'ready-2d', error: 'Meshy job failed', meshyJobId: null });
        } else {
          setArmyman({ progress: data.progress ?? 0 });
          pollRef.current = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!cancelled) {
          setArmyman({ status: 'ready-2d', error: 'Polling failed', meshyJobId: null });
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [armyman.status, armyman.meshyJobId, setArmyman]);

  async function runGenerate2D() {
    if (!photo) return;
    setArmyman({ status: 'generating', error: undefined, aiImage: null, modelUrl: null, meshyJobId: null });
    try {
      const resized = await dataUrlToResized(photo);
      const { image } = await generateAIMockup(resized, 'armyman', { pose: armyman.pose, color: armyman.color });
      setArmyman({ aiImage: image, status: 'ready-2d', modelUrl: null, meshyJobId: null });
    } catch (e) {
      setArmyman({
        status: 'error',
        error: e instanceof Error ? e.message : 'Generation failed',
      });
    }
  }

  async function runGenerate3D() {
    if (!armyman.aiImage) return;
    setArmyman({ status: 'generating-3d', error: undefined, progress: 0 });
    try {
      const r = await fetch('/api/meshy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: armyman.aiImage }),
      });
      const data: { jobId?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok || !data.jobId) {
        setArmyman({
          status: 'ready-2d',
          error: data.error || '3D model will be generated when you order.',
        });
        return;
      }
      setArmyman({ meshyJobId: data.jobId });
    } catch (e) {
      setArmyman({
        status: 'ready-2d',
        error: e instanceof Error ? e.message : 'Meshy job kickoff failed',
      });
    }
  }

  const canReview = armyman.aiImage !== null && (armyman.status === 'ready-2d' || armyman.status === 'ready-3d');

  return (
    <Screen
      footer={
        <Btn full kind="primary" icon="check" disabled={!canReview} onClick={next}>
          Continue to review
        </Btn>
      }
    >
      <Kicker title="Sculpt your army man" sub="Pick a pose and color. We'll mold your toy soldier." />

      {/* Pose picker */}
      <Mono style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8, letterSpacing: '0.08em' }}>POSE</Mono>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {POSES.map((p) => {
          const active = armyman.pose === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setArmyman({ pose: p.id })}
              style={{
                padding: '10px 12px',
                background: active ? 'var(--accent-tint)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--ink-soft)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                borderRadius: 10,
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Color picker */}
      <Mono style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8, letterSpacing: '0.08em' }}>COLOR</Mono>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {COLORS.map((c) => {
          const active = armyman.color === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setArmyman({ color: c.id })}
              style={{
                flex: 1,
                padding: 10,
                background: active ? 'var(--accent-tint)' : 'transparent',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 24, height: 24, borderRadius: 6, background: c.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
              <Mono style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--ink-soft)' }}>{c.label}</Mono>
            </button>
          );
        })}
      </div>

      {/* Regenerate with current pose/color */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          onClick={runGenerate2D}
          disabled={armyman.status === 'generating' || armyman.status === 'generating-3d'}
          style={{
            border: 'none', cursor: 'pointer', background: 'var(--surface)',
            color: 'var(--ink)', borderRadius: 10, padding: '8px 14px',
            fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12.5,
            boxShadow: 'inset 0 0 0 1px var(--line)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: (armyman.status === 'generating' || armyman.status === 'generating-3d') ? 0.5 : 1,
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
        {armyman.status === 'generating' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 28 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <Mono style={{ fontSize: 12 }}>Molding your army man...</Mono>
            <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~10-20 seconds</Mono>
          </div>
        ) : armyman.status === 'error' ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {armyman.error || 'Generation failed'}
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
        ) : armyman.modelUrl ? (
          <div style={{ width: '100%', height: 320 }}>
            <ModelViewer url={armyman.modelUrl} />
          </div>
        ) : armyman.aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={armyman.aiImage} alt="Your army man" style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
        ) : (
          <Mono style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Upload a photo to begin</Mono>
        )}
        {armyman.status === 'generating-3d' && (
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
            <Mono style={{ fontSize: 12 }}>Printing 3D model... {armyman.progress ?? 0}%</Mono>
          </div>
        )}
      </div>

      {/* 3D button */}
      {armyman.status === 'ready-2d' && !armyman.modelUrl && (
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
