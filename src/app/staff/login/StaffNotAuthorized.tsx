'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function StaffNotAuthorized({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    setBusy(false);
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)',
        color: '#F4F1EC',
        textAlign: 'center',
      }}
    >
      <section style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>
          STAFF ACCESS
        </div>
        <h1 style={{ fontFamily: 'Roboto', fontSize: 28, lineHeight: 1.08, margin: '0 0 12px' }}>
          This account does not have staff access.
        </h1>
        <p style={{ color: '#B8AE9F', fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' }}>
          {email ? `Signed in as ${email}.` : 'You are signed in with an account that is not on the staff allowlist.'}
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          style={{
            width: '100%',
            minHeight: 48,
            borderRadius: 14,
            border: 'none',
            background: busy ? 'rgba(233,116,53,.5)' : '#E97435',
            color: '#0B0A09',
            fontFamily: 'Roboto',
            fontWeight: 800,
            fontSize: 15,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Signing out...' : 'Sign out and use a different email'}
        </button>
      </section>
    </main>
  );
}