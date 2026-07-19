'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { createClient } from '@/lib/supabase/client';

/**
 * Shown once, right after first sign-in, before a profile has a role.
 * Writes profiles.role then refreshes the server-rendered page so
 * src/app/os/page.tsx re-fetches with the role now set.
 */
export default function RoleSelect() {
  const router = useRouter();
  const [saving, setSaving] = useState<'parent' | 'coach' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const choose = async (role: 'parent' | 'coach') => {
    if (saving) return;
    setSaving(role);
    setErrorMsg('');

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMsg('Your session expired — refresh and sign in again.');
      setSaving(null);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({ id: user.id, role });

    if (error) {
      setErrorMsg(error.message);
      setSaving(null);
      return;
    }

    router.refresh();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 30px',
        textAlign: 'center',
      }}
    >
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 40 }}
      />
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, lineHeight: 1.2, color: '#F4F1EC', marginBottom: 10 }}>
        One last thing
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 30px' }}>
        Are you a parent or guardian, or a coach?
      </p>

      <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(
          [
            { role: 'parent' as const, label: "I'm a parent / guardian", sub: 'Follow your child’s football journey' },
            { role: 'coach' as const, label: "I'm a coach", sub: 'Track and celebrate your squad' },
          ]
        ).map((opt) => (
          <button
            key={opt.role}
            type="button"
            onClick={() => choose(opt.role)}
            disabled={saving !== null}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 3,
              width: '100%',
              minHeight: 60,
              textAlign: 'left',
              background: saving === opt.role ? 'rgba(233,116,53,.22)' : 'rgba(255,255,255,.04)',
              border: '1px solid rgba(233,116,53,.35)',
              borderRadius: 14,
              padding: '12px 18px',
              cursor: saving ? 'default' : 'pointer',
              color: '#F4F1EC',
            }}
          >
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15 }}>
              {saving === opt.role ? 'Saving…' : opt.label}
            </span>
            <span style={{ fontSize: 12, color: '#B8AE9F' }}>{opt.sub}</span>
          </button>
        ))}
      </div>

      {errorMsg && (
        <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 16, maxWidth: 280 }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
