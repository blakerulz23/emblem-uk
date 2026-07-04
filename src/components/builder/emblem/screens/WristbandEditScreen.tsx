'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Stepper, Mono } from '../primitives';
import Icon from '../Icon';
import WristbandPreview from '../WristbandPreview';
import { removeBackgroundSmart, readBlobAsDataUrl } from '../bgRemoval';
import {
  PATCH_TEXT_MAX,
  SIZES,
  TEXT_MAX_LEN,
  WRISTBAND_COLORS,
  WRISTBAND_PRESETS,
  isLogoPreset,
  isTextPreset,
  type LogoState,
  type WristbandPresetKind,
} from '../data';

// Per-preset display style for the Text-style chips so the label is rendered
// in the actual font/weight/treatment it represents.
const PRESET_LABEL_STYLE: Partial<Record<WristbandPresetKind, CSSProperties>> = {
  bold:         { fontFamily: 'var(--font-manrope), system-ui', fontWeight: 800, letterSpacing: '0.02em' },
  'sans-soft':  { fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600 },
  display:      { fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' },
  'verse-ref':  { fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  'serif-heavy':{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontStyle: 'italic' },
  script:       { fontFamily: '"Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive', fontStyle: 'italic', fontWeight: 400, fontSize: 16, letterSpacing: '0.01em' },
  handwritten:  { fontFamily: '"Marker Felt", "Comic Sans MS", "Bradley Hand", cursive', fontWeight: 500 },
  'mono-block': { fontFamily: 'var(--font-jbmono), monospace', fontWeight: 800, letterSpacing: '0.05em' },
  'verse-full': { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', fontSize: 12 },
  outline:      { fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, color: 'transparent', WebkitTextStroke: '1px currentColor', letterSpacing: '0.02em' },
  name:         { fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, letterSpacing: '0.02em' },
  number:       { fontFamily: 'var(--font-jbmono), monospace', fontWeight: 800, letterSpacing: '0.03em' },
};

const TEXT_KINDS: WristbandPresetKind[] = [
  'bold', 'sans-soft', 'display', 'verse-ref', 'serif-heavy',
  'script', 'handwritten', 'mono-block', 'verse-full', 'outline', 'name', 'number',
];
const LOGO_KINDS: WristbandPresetKind[] = [
  'logo-scatter', 'logo-repeat', 'logo-centered', 'logo-border',
];

// Inspiration placeholders.
const INSPIRATION_PALETTE: Array<[string, string, string]> = [
  ['#0b0b0f', '#FF5A1F', 'Maya'],
  ['#1e3a8a', '#FFFFFF', 'Jordan'],
  ['#7c3aed', '#FFFFFF', 'Sofia'],
  ['#16a34a', '#FFFFFF', 'Diego'],
  ['#dc2626', '#FFFFFF', 'Avery'],
  ['#ec4899', '#FFFFFF', 'Riley'],
  ['#d97706', '#FFFFFF', 'Cam'],
  ['#0ea5e9', '#FFFFFF', 'Noah'],
];

export default function WristbandEditScreen() {
  const {
    wristband, setBand, setBandLogo, clearBandLogo,
    setPatch, setPatchLogo, clearPatchLogo,
    setActiveEditor,
    size, setSize, qty, setQty, next,
  } = useEmblem();

  const { band, patch, active } = wristband;
  const bandLogoInputRef = useRef<HTMLInputElement>(null);
  const patchLogoInputRef = useRef<HTMLInputElement>(null);
  const [selectionStamp, setSelectionStamp] = useState(0);

  const activePreset = WRISTBAND_PRESETS.find((p) => p.id === band.preset);
  const showBandText = isTextPreset(band.preset);
  const logoReady = band.logo.status === 'ready' && band.logo.src !== null;
  const sizes = SIZES.wristbands;

  const switchTo = (which: 'band' | 'patch') => {
    setActiveEditor(which);
    setSelectionStamp((s) => s + 1);
  };

  const onPickPreset = (id: WristbandPresetKind) => {
    const preset = WRISTBAND_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setBand({
      preset: id,
      text: preset.defaultText !== undefined ? preset.defaultText : band.text,
    });
  };

  const onChangeText = (v: string) => {
    const max = TEXT_MAX_LEN[band.preset] || 24;
    const cleaned = v;
    setBand({ text: cleaned.slice(0, max) });
  };

  // New behavior: on upload we store the raw image only, with status='ready'.
  // Background removal is opt-in via the "Remove background" button below.
  const handleLogoUpload = async (
    file: File | undefined | null,
    update: (patch: Partial<LogoState>) => void,
    onReady?: () => void,
  ) => {
    if (!file) return;
    try {
      const original = await readBlobAsDataUrl(file);
      update({ src: original, processed: null, status: 'ready', method: undefined, error: undefined });
      onReady?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read image';
      update({ status: 'error', error: message });
    }
  };

  // On-demand background removal — runs only when the user taps the button.
  const removeLogoBackground = async (
    logo: LogoState,
    update: (patch: Partial<LogoState>) => void,
  ) => {
    if (!logo.src) return;
    update({ status: 'processing', error: undefined });
    try {
      const resp = await fetch(logo.src);
      const blob = await resp.blob();
      // removeBackgroundSmart expects a File; wrap the blob with a synthetic name.
      const file = new File([blob], 'logo.png', { type: blob.type || 'image/png' });
      const { dataUrl, method } = await removeBackgroundSmart(file);
      update({ processed: dataUrl, status: 'ready', method });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background removal failed';
      update({ status: 'error', error: message });
    }
  };

  // Revert from cut-out back to the original photo with background.
  const restoreLogoOriginal = (update: (patch: Partial<LogoState>) => void) => {
    update({ processed: null, method: undefined, status: 'ready', error: undefined });
  };

  const onUploadBandLogo = (file?: File | null) =>
    handleLogoUpload(file, setBandLogo, () => {
      if (!isLogoPreset(band.preset)) setBand({ preset: 'logo-scatter' });
    });
  const onUploadPatchLogo = (file?: File | null) =>
    handleLogoUpload(file, setPatchLogo, () => { setPatch({ kind: 'logo' }); });

  const ChipStrip = ({
    label,
    ids,
    selectedId,
    disabled = false,
    onPick,
  }: {
    label?: string;
    ids: WristbandPresetKind[];
    selectedId: WristbandPresetKind;
    disabled?: boolean;
    onPick: (id: WristbandPresetKind) => void;
  }) => (
    <div>
      {label && (
        <Mono style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
          {label}
        </Mono>
      )}
      <div
        className="no-scrollbar"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -22px', padding: '0 22px 2px', WebkitOverflowScrolling: 'touch' }}
      >
        {ids.map((id) => {
          const p = WRISTBAND_PRESETS.find((x) => x.id === id);
          if (!p) return null;
          const isActive = selectedId === id;
          const labelStyle = PRESET_LABEL_STYLE[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => !disabled && onPick(id)}
              disabled={disabled}
              style={{
                flexShrink: 0, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                borderRadius: 999, padding: '10px 16px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14,
                background: isActive && !disabled ? 'var(--ink)' : 'var(--surface)',
                color: isActive && !disabled ? '#fff' : disabled ? 'var(--ink-faint)' : 'var(--ink-soft)',
                boxShadow: isActive && !disabled ? 'none' : 'inset 0 0 0 1px var(--line)',
                whiteSpace: 'nowrap', opacity: disabled ? 0.55 : 1,
                ...(labelStyle || {}),
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );

  const ColorPicker = ({
    selectedId,
    onPick,
    bandImage,
    onUploadImage,
    onClearImage,
  }: {
    selectedId: string;
    onPick: (id: string) => void;
    bandImage?: string | null;
    onUploadImage?: (file: File) => void;
    onClearImage?: () => void;
  }) => {
    const isHexSelected = selectedId.startsWith('#');
    const [hexInput, setHexInput] = useState(isHexSelected ? selectedId : '');
    const [showHex, setShowHex] = useState(isHexSelected); // hidden by default, surfaced via rainbow
    const validHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);

    const commitHex = (raw: string) => {
      let v = raw.trim();
      if (!v) return;
      if (!v.startsWith('#')) v = '#' + v;
      if (validHex(v)) onPick(v.toUpperCase());
    };

    const swatch = WRISTBAND_COLORS.find((c) => c.id === selectedId);
    const imageInputRef = useRef<HTMLInputElement>(null);

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {WRISTBAND_COLORS.map((c) => {
            const isActive = !isHexSelected && !bandImage && selectedId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={() => { onPick(c.id); setHexInput(''); setShowHex(false); }}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: c.bg,
                  boxShadow: isActive
                    ? '0 0 0 2px var(--accent), inset 0 0 0 1px rgba(0,0,0,.1)'
                    : `inset 0 0 0 1px ${c.id === 'white' ? 'var(--line)' : 'rgba(0,0,0,.12)'}`,
                  transition: 'box-shadow .15s ease',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: c.fg }}>
                    <Icon name="check" size={16} />
                  </span>
                )}
              </button>
            );
          })}

          {/* Rainbow circle — toggles the hex input */}
          <button
            type="button"
            aria-label="Custom hex color"
            onClick={() => setShowHex((v) => !v)}
            style={{
              width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #84cc16, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
              boxShadow: showHex
                ? '0 0 0 2px var(--accent), inset 0 0 0 1px rgba(0,0,0,.12)'
                : 'inset 0 0 0 1px rgba(0,0,0,.12), 0 2px 6px rgba(11,11,15,.1)',
              position: 'relative',
              display: 'grid', placeItems: 'center',
            }}
          >
            {isHexSelected && (
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', textShadow: '0 0 4px rgba(0,0,0,.4)' }}>
                <Icon name="check" size={16} />
              </span>
            )}
          </button>

          {/* Upload-image circle (only when onUploadImage is provided) */}
          {onUploadImage && (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadImage(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                aria-label="Upload band image"
                onClick={() => imageInputRef.current?.click()}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: bandImage ? `url(${bandImage}) center/cover no-repeat` : 'var(--surface)',
                  boxShadow: bandImage
                    ? '0 0 0 2px var(--accent), inset 0 0 0 1px rgba(0,0,0,.12)'
                    : 'inset 0 0 0 1.5px var(--ink-faint)',
                  display: 'grid', placeItems: 'center',
                  color: bandImage ? '#fff' : 'var(--ink-soft)',
                  position: 'relative',
                }}
              >
                {!bandImage && <Icon name="upload" size={15} />}
                {bandImage && (
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', textShadow: '0 0 4px rgba(0,0,0,.55)' }}>
                    <Icon name="check" size={16} />
                  </span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Show "Custom band image" pill when uploaded — clear button */}
        {bandImage && onClearImage && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 12, background: 'var(--accent-tint)',
            color: 'var(--accent)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: `url(${bandImage}) center/cover no-repeat`,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)',
            }} />
            <span style={{ flex: 1, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13 }}>
              Custom band image
            </span>
            <button
              type="button"
              onClick={onClearImage}
              style={{
                background: '#fff', color: 'var(--ink)', border: 'none', cursor: 'pointer',
                borderRadius: 8, padding: '5px 10px',
                fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12,
                boxShadow: 'inset 0 0 0 1px var(--line)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <Icon name="trash" size={11} /> Remove
            </button>
          </div>
        )}

        {/* Hex input — hidden until rainbow circle is tapped */}
        {showHex && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12, background: 'var(--surface)',
              boxShadow: isHexSelected ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
            }}
          >
            <div
              aria-hidden
              style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: isHexSelected ? selectedId : (swatch?.bg || 'var(--line)'),
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)',
              }}
            />
            <Mono style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', flexShrink: 0 }}>
              Hex
            </Mono>
            <input
              type="text"
              value={hexInput}
              autoFocus
              onChange={(e) => {
                const v = e.target.value;
                setHexInput(v);
                if (validHex(v) || validHex('#' + v)) commitHex(v);
              }}
              onBlur={(e) => commitHex(e.target.value)}
              placeholder="#FF5A1F"
              spellCheck={false}
              autoCapitalize="off"
              style={{
                flex: 1, minWidth: 0,
                border: 'none', background: 'transparent', outline: 'none',
                fontFamily: 'var(--font-jbmono), monospace',
                fontSize: 14, fontWeight: 600, color: 'var(--ink)',
                padding: 0,
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const LogoBlock = ({
    logo, onUpload, onClear, onRemoveBg, onRestore, inputRef,
  }: {
    logo: LogoState;
    onUpload: (file?: File | null) => void;
    onClear: () => void;
    onRemoveBg: () => void;
    onRestore: () => void;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => {
    const hasOriginal = logo.src !== null;
    const hasCutout = logo.processed !== null;
    const isProcessing = logo.status === 'processing';
    const hasError = logo.status === 'error';

    return (
      <>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onUpload(e.target.files?.[0])} />
        {!hasOriginal ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              width: '100%', minHeight: 76, borderRadius: 14, border: 'none',
              background: 'var(--surface)', boxShadow: 'inset 0 0 0 1.5px var(--line)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 42, height: 42, borderRadius: 11, background: '#fff',
                display: 'grid', placeItems: 'center', color: 'var(--accent)',
                boxShadow: '0 4px 14px rgba(0,0,0,.06)', flexShrink: 0,
              }}
            >
              <Icon name="upload" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
                Upload a logo
              </div>
              <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 1, lineHeight: 1.3 }}>
                Uploads as-is. Tap &ldquo;Remove background&rdquo; after if you want it cut out.
              </div>
            </div>
            <Icon name="chevR" size={16} style={{ color: 'var(--ink-faint)' }} />
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ borderRadius: 14, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1.5px var(--line)', padding: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 50, height: 50, borderRadius: 10,
                  background: hasCutout ? 'linear-gradient(45deg, #fff 25%, #e9eaee 25%, #e9eaee 50%, #fff 50%, #fff 75%, #e9eaee 75%) 0/14px 14px' : '#fff',
                  position: 'relative', flexShrink: 0, overflow: 'hidden',
                }}
              >
                {hasCutout ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.processed!} alt="" style={{ position: 'absolute', inset: 3, width: 'calc(100% - 6px)', height: 'calc(100% - 6px)', objectFit: 'contain' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.src!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                  {isProcessing ? 'Removing background…' :
                   hasCutout ? (logo.method === 'canvas' ? 'Cut out (simple)' : 'Cut out (clean)') :
                   hasError ? 'Couldn’t cut it out' :
                   'Original logo'}
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.3 }}>
                  {isProcessing ? 'First run loads a small model.' :
                   hasCutout ? (logo.method === 'canvas' ? 'Used a flat-background trimmer.' : 'Used the ML model.') :
                   hasError ? (logo.error || 'Try a different photo.') :
                   'Showing the raw image you uploaded.'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={{
                    border: 'none', cursor: 'pointer', background: '#fff', color: 'var(--ink)',
                    borderRadius: 9, padding: '6px 10px',
                    fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12,
                    boxShadow: 'inset 0 0 0 1px var(--line)',
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  style={{
                    border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--ink-soft)',
                    padding: '2px 6px',
                    fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 12,
                    display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center',
                  }}
                >
                  <Icon name="trash" size={11} /> Remove
                </button>
              </div>
            </div>

            {/* Remove background / Restore original toggle */}
            {!hasCutout && !isProcessing && (
              <button
                type="button"
                onClick={onRemoveBg}
                style={{
                  border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: 12, padding: '11px 14px',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13.5,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  boxShadow: '0 6px 16px var(--accent-glow)',
                }}
              >
                <Icon name="sparkle" size={15} /> Remove background
              </button>
            )}
            {hasCutout && !isProcessing && (
              <button
                type="button"
                onClick={onRestore}
                style={{
                  border: 'none', cursor: 'pointer',
                  background: 'var(--surface)', color: 'var(--ink)',
                  borderRadius: 12, padding: '11px 14px',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 600, fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                }}
              >
                <Icon name="refresh" size={14} /> Restore original
              </button>
            )}
            {isProcessing && (
              <div style={{
                borderRadius: 12, padding: '11px 14px', background: 'var(--accent-tint)',
                color: 'var(--accent)', fontFamily: 'var(--font-manrope), system-ui',
                fontWeight: 600, fontSize: 13, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 999,
                  border: '2px solid var(--accent-tint)', borderTopColor: 'var(--accent)',
                  animation: 'spin 0.9s linear infinite',
                }} />
                Removing background…
              </div>
            )}
            {hasError && (
              <button
                type="button"
                onClick={onRemoveBg}
                style={{
                  border: 'none', cursor: 'pointer',
                  background: 'var(--ink)', color: '#fff',
                  borderRadius: 12, padding: '11px 14px',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13.5,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
              >
                <Icon name="refresh" size={14} /> Try again
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <Screen
      footer={<Btn full kind="primary" iconR="chevR" onClick={() => next()}>Review order</Btn>}
    >
      <Kicker
        title="Design your wristband."
        sub="Tap the band or the patch to design each piece. The patch on the right is your Emblem tap target."
      />

      <div
        style={{
          display: 'grid', placeItems: 'center',
          background: 'radial-gradient(70% 100% at 50% 50%, #fafafc 0%, transparent 70%)',
          padding: '14px 8px 22px',
        }}
      >
        <WristbandPreview
          state={wristband}
          interactive
          active={active}
          selectionStamp={selectionStamp}
          onTapBand={() => switchTo('band')}
          onTapPatch={() => switchTo('patch')}
        />
      </div>

      {/* Tab toggle */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4,
          borderRadius: 14, background: 'var(--surface)',
          boxShadow: 'inset 0 0 0 1px var(--line)', marginTop: 4,
        }}
      >
        {(['band', 'patch'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => switchTo(side)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 10, height: 40,
              fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14,
              background: active === side ? '#fff' : 'transparent',
              color: active === side ? 'var(--ink)' : 'var(--ink-soft)',
              boxShadow: active === side ? '0 2px 8px rgba(11,11,15,.06)' : 'none',
              transition: 'all .15s ease',
            }}
          >
            {side === 'band' ? 'Band' : 'Emblem patch'}
          </button>
        ))}
      </div>

      {/* BAND editor — Color → Logo → Text → Text style */}
      {active === 'band' && (
        <>
          {/* 1. Color (now at top) — includes rainbow→hex toggle + upload circle */}
          <div style={{ marginTop: 22 }}>
            <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Band color
            </Mono>
            <ColorPicker
              selectedId={band.colorId}
              onPick={(colorId) => setBand({ colorId, bandImage: null })}
              bandImage={band.bandImage || null}
              onUploadImage={async (file) => {
                const dataUrl = await readBlobAsDataUrl(file);
                setBand({ bandImage: dataUrl });
              }}
              onClearImage={() => setBand({ bandImage: null })}
            />
          </div>

          {/* 2. Logo */}
          <div
            style={{
              marginTop: 22, padding: 14, borderRadius: 18, background: '#fff',
              boxShadow: 'inset 0 0 0 1px var(--line)', display: 'grid', gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Your logo
              </Mono>
              {!logoReady && (
                <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11, color: 'var(--ink-faint)' }}>
                  Patterns unlock after upload
                </span>
              )}
            </div>
            <LogoBlock
              logo={band.logo}
              onUpload={onUploadBandLogo}
              onClear={clearBandLogo}
              onRemoveBg={() => removeLogoBackground(band.logo, setBandLogo)}
              onRestore={() => restoreLogoOriginal(setBandLogo)}
              inputRef={bandLogoInputRef}
            />
            <div>
              <Mono style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
                Logo patterns
              </Mono>
              <ChipStrip ids={LOGO_KINDS} selectedId={band.preset} onPick={onPickPreset} disabled={!logoReady} />
            </div>
          </div>

          {/* 3. Text input */}
          {showBandText && (
            <div style={{ marginTop: 22 }}>
              <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Text
              </Mono>
              {band.preset === 'verse-full' ? (
                <textarea
                  value={band.text}
                  onChange={(e) => onChangeText(e.target.value)}
                  maxLength={TEXT_MAX_LEN[band.preset]}
                  placeholder={activePreset?.defaultText}
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', borderRadius: 14, border: 'none',
                    padding: '12px 16px',
                    fontFamily: 'var(--font-manrope), system-ui',
                    fontSize: 14.5, fontWeight: 500, color: 'var(--ink)', background: 'var(--surface)',
                    outline: 'none', boxShadow: 'inset 0 0 0 1px var(--line)', resize: 'vertical',
                    minHeight: 80, lineHeight: 1.5,
                  }}
                />
              ) : (
                <input
                  type={band.preset === 'number' ? 'tel' : 'text'}
                  value={band.text}
                  onChange={(e) => onChangeText(e.target.value)}
                  maxLength={TEXT_MAX_LEN[band.preset]}
                  placeholder={activePreset?.defaultText}
                  style={{
                    width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 14, border: 'none',
                    padding: '0 16px',
                    fontFamily: band.preset === 'number' ? 'var(--font-jbmono), monospace' : 'var(--font-manrope), system-ui',
                    fontSize: 16, fontWeight: 500, color: 'var(--ink)', background: 'var(--surface)',
                    outline: 'none', boxShadow: 'inset 0 0 0 1px var(--line)',
                  }}
                />
              )}
              {activePreset?.helper && (
                <Mono style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ink-faint)' }}>
                  {activePreset.helper}
                </Mono>
              )}
            </div>
          )}

          {/* 4. Text style (now below Text) */}
          <div style={{ marginTop: 22 }}>
            <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
              Text style
            </Mono>
            <ChipStrip ids={TEXT_KINDS} selectedId={band.preset} onPick={onPickPreset} />
          </div>
        </>
      )}

      {/* PATCH editor — Color → Patch shows → Text/Logo */}
      {active === 'patch' && (
        <>
          {/* 1. Patch color (now at top) */}
          <div style={{ marginTop: 22 }}>
            <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Patch color
            </Mono>
            <ColorPicker selectedId={patch.colorId} onPick={(colorId) => setPatch({ colorId })} />
          </div>

          {/* 2. Patch shows */}
          <div style={{ marginTop: 22 }}>
            <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Patch shows
            </Mono>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { id: 'text'  as const, name: '2-char text', icon: 'text' as const },
                { id: 'logo'  as const, name: 'Your logo',   icon: 'logo' as const },
                { id: 'brand' as const, name: 'EMBLEM mark', icon: 'mark' as const },
              ]).map((opt) => {
                const isActive = patch.kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPatch({ kind: opt.id })}
                    style={{
                      flex: '1 1 auto', minWidth: 100, border: 'none', cursor: 'pointer',
                      borderRadius: 14, padding: '14px 14px',
                      fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 13.5,
                      background: isActive ? 'var(--accent-tint)' : 'var(--surface)',
                      color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
                      boxShadow: isActive ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                      display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                    }}
                  >
                    <Icon name={opt.icon} size={16} />
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>

          {patch.kind === 'text' && (
            <div style={{ marginTop: 18 }}>
              <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Patch text
              </Mono>
              <input
                type="text"
                value={patch.text}
                onChange={(e) => setPatch({ text: e.target.value.slice(0, PATCH_TEXT_MAX) })}
                maxLength={PATCH_TEXT_MAX}
                placeholder="MC"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 14, border: 'none',
                  padding: '0 16px',
                  fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 22,
                  letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center',
                  color: 'var(--ink)', background: 'var(--surface)',
                  outline: 'none', boxShadow: 'inset 0 0 0 1px var(--line)',
                }}
              />
              <Mono style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ink-faint)' }}>
                Up to {PATCH_TEXT_MAX} characters · monogram-style
              </Mono>
            </div>
          )}

          {patch.kind === 'logo' && (
            <div style={{ marginTop: 18 }}>
              <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
                Patch logo
              </Mono>
              <LogoBlock
                logo={patch.logo}
                onUpload={onUploadPatchLogo}
                onClear={clearPatchLogo}
                onRemoveBg={() => removeLogoBackground(patch.logo, setPatchLogo)}
                onRestore={() => restoreLogoOriginal(setPatchLogo)}
                inputRef={patchLogoInputRef}
              />
            </div>
          )}
        </>
      )}

      {/* Size + qty */}
      <div style={{ marginTop: 26, display: 'grid', gap: 16 }}>
        <div>
          <Mono style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
            Size
          </Mono>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 12, padding: '11px 16px',
                  fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: 14,
                  background: size === s ? 'var(--accent-tint)' : 'var(--surface)',
                  color: size === s ? 'var(--accent)' : 'var(--ink-soft)',
                  boxShadow: size === s ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--line)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Quantity
          </Mono>
          <Stepper value={qty} onChange={setQty} />
        </div>
      </div>

      {/* Inspiration auto-scroll marquee (left-to-right) */}
      <div style={{ marginTop: 32, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <Mono style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            See it on
          </Mono>
          <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 11.5, color: 'var(--ink-faint)' }}>
            How others wear theirs
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
                {INSPIRATION_PALETTE.map(([bg, accent, name], i) => (
                  <div
                    key={`${dup}-${i}`}
                    style={{
                      flex: '0 0 132px',
                      aspectRatio: '4 / 5',
                      borderRadius: 16,
                      background: `radial-gradient(120% 100% at 50% 0%, ${bg} 0%, ${bg}dd 50%, #1a1a22 100%)`,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(11,11,15,.18)',
                    }}
                  >
                    <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
                      <defs>
                        <linearGradient id={`wb-insp-${dup}-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
                          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
                        </linearGradient>
                      </defs>
                      <circle cx="50" cy="46" r="20" fill={`url(#wb-insp-${dup}-${i})`} />
                      <path d="M14 130 c0-32 16-54 36-54 s36 22 36 54 z" fill={`url(#wb-insp-${dup}-${i})`} />
                      <ellipse cx="50" cy="100" rx="22" ry="3.5" fill={accent} opacity="0.95" />
                      <rect x="62" y="97.5" width="6" height="5" rx="1" fill="#fff" opacity="0.92" />
                    </svg>
                    <div
                      style={{
                        position: 'absolute', left: 10, bottom: 10,
                        color: '#fff', fontFamily: 'var(--font-sora), system-ui',
                        fontWeight: 700, fontSize: 13,
                        textShadow: '0 2px 6px rgba(0,0,0,0.35)',
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
