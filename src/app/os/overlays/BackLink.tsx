'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

/**
 * Top-left back control shared by every sign-in / onboarding screen inside
 * ActivationGate (adapted from the Canadian repo). These screens are client
 * state steps, not routes, so the browser's back button leaves /os entirely;
 * this gives every step its own way back.
 *
 * - onClick: go back one step inside the flow.
 * - href: leave the flow (e.g. back to the website from the first screen).
 */
const style: CSSProperties = {
  position: 'absolute',
  top: 'calc(14px + env(safe-area-inset-top, 0px))',
  left: 12,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  color: '#B8AE9F',
  fontFamily: 'Roboto, system-ui, sans-serif',
  fontWeight: 700,
  fontSize: 13.5,
  textDecoration: 'none',
  cursor: 'pointer',
};

function Chevron() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function BackLink(props: { label?: string } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })) {
  const label = props.label ?? 'Back';
  if (props.href) {
    return (
      <Link href={props.href} aria-label={label} style={style} data-testid="os-back">
        <Chevron />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} aria-label={label} style={style} data-testid="os-back">
      <Chevron />
      {label}
    </button>
  );
}
