'use client';

import { useState } from 'react';

/**
 * Same clipboard-write + "Copied!" toggle pattern as the coach-invite
 * copy-link button in src/app/os/screens/Profile.tsx, restyled to this
 * page's action-button convention. Soft-fails if the Clipboard API is
 * unavailable — the link itself is still visible/selectable elsewhere.
 */
export default function CopyLinkButton({ url, label = 'Copy' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the link is still available via Open.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        fontFamily: 'var(--font-sora), system-ui',
        fontWeight: 700,
        fontSize: 12.5,
        color: copied ? '#047857' : 'var(--accent)',
        background: copied ? '#ecfdf5' : 'var(--accent-tint)',
        padding: '8px 14px',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
