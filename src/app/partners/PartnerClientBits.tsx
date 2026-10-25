'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BODY, INPUT } from './ui';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...BODY, fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input readOnly value={value} style={INPUT} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button type="button" onClick={copy} style={{ ...BODY, fontWeight: 700, padding: '0 14px', borderRadius: 10, border: '1px solid var(--accent)', background: '#fff', cursor: 'pointer' }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        window.location.href = '/partners';
      }}
      style={{ ...BODY, fontSize: 14, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
    >
      Sign out
    </button>
  );
}
