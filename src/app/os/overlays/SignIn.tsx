'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';
import { createClient } from '@/lib/supabase/client';

/**
 * The entry point into Emblem OS when there's no Supabase session yet.
 * Magic-link only — no passwords to leak for a children's-data app.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          typeof window !== 'undefined' ? `${window.location.origin}/os` : undefined,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStatus('sent');
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background:
          'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 30px',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{
          height: 30,
          width: 'auto',
          objectFit: 'contain',
          filter: 'brightness(0) invert(1)',
          opacity: 0.92,
          marginBottom: 40,
        }}
      />

      {status === 'sent' ? (
        <>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: 'rgba(233,116,53,.14)',
              border: '1.5px solid rgba(233,116,53,.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 34,
            }}
          >
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16v12H4z" />
              <path d="M4 7l8 6 8-6" />
            </svg>
          </div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, lineHeight: 1.2, color: '#F4F1EC', marginBottom: 10 }}>
            Check your email
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: 0 }}>
            We sent a sign-in link to <strong style={{ color: '#F4F1EC' }}>{email.trim()}</strong>. Open it on this device to continue.
          </p>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>
            WELCOME TO EMBLEM
          </div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 27, lineHeight: 1.08, color: '#F4F1EC', marginBottom: 12 }}>
            Every football story<br />starts somewhere.
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 28px' }}>
            Sign in with your email to unlock your child&apos;s living football journey.
          </p>

          <form onSubmit={submit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid rgba(233,116,53,.35)',
                background: 'rgba(255,255,255,.04)',
                color: '#F4F1EC',
                fontFamily: 'Roboto',
                fontSize: 15,
                padding: '0 16px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={status === 'sending' || !email.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: status === 'sending' ? 'rgba(233,116,53,.5)' : '#E97435',
                color: '#0B0A09',
                fontFamily: 'Roboto',
                fontWeight: 800,
                fontSize: 15,
                minHeight: 48,
                padding: '15px 30px',
                borderRadius: 14,
                border: 'none',
                cursor: status === 'sending' ? 'default' : 'pointer',
                boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
              }}
            >
              {status === 'sending' ? 'Sending link…' : 'Send sign-in link'}
            </button>
          </form>

          {status === 'error' && (
            <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>
              {errorMsg || 'Something went wrong — try again.'}
            </p>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24, color: 'var(--os-muted)', fontSize: 12 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B8478" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
        </svg>
        Private &amp; secure · no password to leak
      </div>
    </div>
  );
}
