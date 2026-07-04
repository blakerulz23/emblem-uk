'use client';

// src/components/builder/emblem/AIMockupBlock.tsx
// Reusable block for any product that wants an AI mockup:
//   1) Drop/select a fresh photo (own upload — independent of the main flow's photo)
//   2) Posts to /api/ai-mockup with the right `kind`
//   3) Renders the loading state, the result, and a "regenerate" button
//
// Drop this inside any editor screen, give it a kind, and it handles the rest.
// Generated image data URL is communicated back via onImage(...).

import { useRef, useState } from 'react';
import Icon from './Icon';
import { Mono } from './primitives';
import { fileToResizedDataUrl, generateAIMockup, type AIKind } from './aiMockup';

type Status = 'idle' | 'reading' | 'generating' | 'ready' | 'error';

export default function AIMockupBlock({
  kind,
  image,
  onImage,
  label = 'AI mockup',
  hint = 'Upload a clear, front-facing photo. We’ll render an AI mockup in 10–20 seconds.',
  height = 280,
}: {
  kind: AIKind;
  image: string | null;
  onImage: (image: string | null) => void;
  label?: string;
  hint?: string;
  height?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(image ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const run = async (file: File) => {
    setLastFile(file);
    setError(null);
    setStatus('reading');
    let dataUrl: string;
    try {
      dataUrl = await fileToResizedDataUrl(file);
      setSrc(dataUrl);
    } catch (e) {
      setStatus('error');
      setError('Could not read that image. Try another.');
      return;
    }
    setStatus('generating');
    try {
      const { image: img } = await generateAIMockup(dataUrl, kind);
      onImage(img);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Generation failed.');
    }
  };

  const reset = () => {
    setSrc(null);
    onImage(null);
    setStatus('idle');
    setError(null);
    setLastFile(null);
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        background: '#fff',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Mono
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          {label}
        </Mono>
        {status === 'ready' && image && (
          <button
            type="button"
            onClick={reset}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 600,
              fontSize: 12.5,
              color: 'var(--ink-soft)',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon name="trash" size={13} /> Clear
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(f);
          e.target.value = '';
        }}
      />

      {/* Preview frame */}
      <div
        style={{
          position: 'relative',
          height,
          borderRadius: 14,
          background: 'var(--surface)',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'inset 0 0 0 1px var(--line)',
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#fff',
            }}
          />
        ) : status === 'generating' || status === 'reading' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink-soft)' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: '3px solid var(--accent-tint)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <Mono style={{ fontSize: 12 }}>
              {status === 'reading' ? 'Reading photo…' : 'Stitching mockup…'}
            </Mono>
            {status === 'generating' && (
              <Mono style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>~10–20 seconds</Mono>
            )}
          </div>
        ) : status === 'error' ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)' }}>
            <Icon name="warn" size={28} style={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
              {error || 'Generation failed'}
            </div>
            <button
              type="button"
              onClick={() => {
                if (lastFile) run(lastFile);
                else inputRef.current?.click();
              }}
              style={{
                marginTop: 12,
                border: 'none',
                cursor: 'pointer',
                background: 'var(--ink)',
                color: '#fff',
                borderRadius: 10,
                padding: '8px 14px',
                fontFamily: 'var(--font-manrope), system-ui',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 18,
              textAlign: 'center',
              color: 'var(--ink-soft)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 10px 24px var(--accent-glow)',
              }}
            >
              <Icon name="upload" size={24} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 700,
                fontSize: 16,
                color: 'var(--ink)',
              }}
            >
              Drop a photo
            </div>
            <Mono style={{ fontSize: 11.5, color: 'var(--ink-faint)', maxWidth: 260 }}>
              {hint}
            </Mono>
          </button>
        )}
      </div>

      {/* Action row */}
      {status === 'ready' && image && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => lastFile && run(lastFile)}
            style={{
              flex: 1,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--surface)',
              color: 'var(--ink)',
              borderRadius: 10,
              padding: '10px 14px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700,
              fontSize: 13.5,
              boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <Icon name="refresh" size={15} /> Regenerate
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              flex: 1,
              border: 'none',
              cursor: 'pointer',
              background: '#fff',
              color: 'var(--ink)',
              borderRadius: 10,
              padding: '10px 14px',
              fontFamily: 'var(--font-manrope), system-ui',
              fontWeight: 700,
              fontSize: 13.5,
              boxShadow: 'inset 0 0 0 1px var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <Icon name="upload" size={15} /> New photo
          </button>
        </div>
      )}

      {/* Source thumbnail */}
      {src && status !== 'idle' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            borderRadius: 10,
            background: 'var(--surface)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              overflow: 'hidden',
              flexShrink: 0,
              background: '#fff',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <Mono style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            Your source photo · we never store it
          </Mono>
        </div>
      )}
    </div>
  );
}
