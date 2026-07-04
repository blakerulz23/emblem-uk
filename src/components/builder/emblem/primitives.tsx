'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './data';

// ──────────────────────────────────────────────────────
// Btn
// ──────────────────────────────────────────────────────
type BtnKind = 'primary' | 'dark' | 'ghost' | 'plain';
type BtnSize = 'lg' | 'sm';

export function Btn({
  children,
  onClick,
  kind = 'primary',
  size = 'lg',
  icon,
  iconR,
  full,
  disabled,
  type = 'button',
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: BtnKind;
  size?: BtnSize;
  icon?: IconName;
  iconR?: IconName;
  full?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    fontFamily: 'var(--font-manrope), system-ui',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: 16,
    width: full ? '100%' : undefined,
    transition: 'transform .15s ease, box-shadow .2s ease, background .2s ease',
    opacity: disabled ? 0.4 : 1,
    whiteSpace: 'nowrap',
    padding: size === 'lg' ? '0 22px' : '0 16px',
    height: size === 'lg' ? 56 : 44,
    fontSize: size === 'lg' ? 17 : 15,
  };
  const kinds: Record<BtnKind, CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff', boxShadow: '0 6px 22px var(--accent-glow)' },
    dark: { background: 'var(--ink)', color: '#fff' },
    ghost: { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line)' },
    plain: { background: 'transparent', color: 'var(--ink-soft)' },
  };
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...kinds[kind], ...style }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.975)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onTouchStart={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.975)')}
      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} />}
      {children}
      {iconR && <Icon name={iconR} size={size === 'lg' ? 20 : 18} />}
    </button>
  );
}

// ──────────────────────────────────────────────────────
// Field
// ──────────────────────────────────────────────────────
export function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  maxLength,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  maxLength?: number;
  type?: 'text' | 'tel' | 'email';
}) {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          fontFamily: 'var(--font-jbmono), monospace',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: 52,
          borderRadius: 14,
          border: 'none',
          padding: '0 16px',
          fontFamily: mono ? 'var(--font-jbmono), monospace' : 'var(--font-manrope), system-ui',
          fontSize: mono ? 17 : 16,
          fontWeight: mono ? 600 : 500,
          color: 'var(--ink)',
          background: focus ? '#fff' : 'var(--surface)',
          outline: 'none',
          boxShadow: focus ? '0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--line)',
          transition: 'box-shadow .15s ease, background .15s ease',
        }}
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────
// Stepper
// ──────────────────────────────────────────────────────
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const btn = (dir: -1 | 1, ic: IconName) => (
    <button
      type="button"
      onClick={() => onChange(Math.max(min, Math.min(max, value + dir)))}
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        border: 'none',
        background: '#fff',
        boxShadow: 'inset 0 0 0 1px var(--line)',
        color: 'var(--ink)',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Icon name={ic} size={17} />
    </button>
  );
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--surface)',
        borderRadius: 14,
        padding: 4,
      }}
    >
      {btn(-1, 'minus')}
      <div
        style={{
          minWidth: 30,
          textAlign: 'center',
          fontFamily: 'var(--font-jbmono), monospace',
          fontWeight: 600,
          fontSize: 16,
          color: 'var(--ink)',
        }}
      >
        {value}
      </div>
      {btn(1, 'plus')}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Mono
// ──────────────────────────────────────────────────────
export function Mono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jbmono), monospace',
        letterSpacing: '0.04em',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
