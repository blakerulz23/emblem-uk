'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { createClient } from '@/lib/supabase/client';

/**
 * The entry point into Emblem OS when there's no Supabase session yet.
 * Sends a one-time code by email and verifies it in-app, rather than relying
 * on the user clicking a link — email security scanners (Outlook Safe Links
 * and similar) pre-visit links in incoming mail and silently burn through
 * a magic link's one-time token before the real user ever clicks it. A code
 * typed into the app can't be consumed that way.
 */
export default function SignIn({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // Which screen to show — independent of `status`, so a failed code
  // verification shows its error on the code screen rather than bouncing
  // back to the email screen (status alone can't distinguish "error while
  // sending" from "error while verifying").
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.href,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStep('code');
    setStatus('idle');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.refresh();
    }
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

      {step === 'code' ? (
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
            Enter your code
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 24px' }}>
            We sent a one-time code to <strong style={{ color: '#F4F1EC' }}>{email.trim()}</strong>.
          </p>

          <form onSubmit={verifyCode} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345678"
              aria-label="One-time code"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid rgba(233,116,53,.35)',
                background: 'rgba(255,255,255,.04)',
                color: '#F4F1EC',
                fontFamily: 'Roboto',
                fontSize: 20,
                letterSpacing: '.3em',
                textAlign: 'center',
                padding: '0 16px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading' || !code.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
                color: '#0B0A09',
                fontFamily: 'Roboto',
                fontWeight: 800,
                fontSize: 15,
                minHeight: 48,
                padding: '15px 30px',
                borderRadius: 14,
                border: 'none',
                cursor: status === 'loading' ? 'default' : 'pointer',
                boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
              }}
            >
              {status === 'loading' ? 'Verifying…' : 'Verify code'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setStep('email'); setStatus('idle'); setCode(''); setErrorMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Use a different email
          </button>

          {status === 'error' && (
            <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>
              {errorMsg || 'Something went wrong — try again.'}
            </p>
          )}
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

          <form onSubmit={sendCode} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              disabled={status === 'loading' || !email.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
                color: '#0B0A09',
                fontFamily: 'Roboto',
                fontWeight: 800,
                fontSize: 15,
                minHeight: 48,
                padding: '15px 30px',
                borderRadius: 14,
                border: 'none',
                cursor: status === 'loading' ? 'default' : 'pointer',
                boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
              }}
            >
              {status === 'loading' ? 'Sending code…' : 'Send sign-in code'}
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
