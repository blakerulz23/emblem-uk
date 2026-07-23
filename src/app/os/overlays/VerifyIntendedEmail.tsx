'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';

/**
 * The masked-email confirm-to-send/enter-code step for a standalone
 * invite's intended recipient. Never sees the real address — only the
 * masked display value from GET /api/os/invites/redeem. "Send code" and
 * "Verify" call /api/os/invites/send-code and /api/os/invites/verify-code,
 * which resolve the real invited_email server-side. "Use a different
 * email" bails out to the ordinary full SignIn flow — the only path for
 * forwarded invitations or a different guardian.
 */
export default function VerifyIntendedEmail({
  inviteCode,
  maskedEmail,
  onVerified,
  onUseDifferentEmail,
}: {
  inviteCode: string;
  maskedEmail: string;
  onVerified: () => void;
  onUseDifferentEmail: () => void;
}) {
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const sendCode = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await fetch('/api/os/invites/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
    } catch {
      // Best-effort — move on to the code step regardless, matching the
      // endpoint's own non-disclosure response shape.
    }
    setStep('code');
    setStatus('idle');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/os/invites/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode, token: token.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMsg(data.error || "That code isn't recognised — check it and try again.");
        return;
      }
      onVerified();
    } catch {
      setStatus('error');
      setErrorMsg('Something went wrong — try again.');
    }
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

      {step === 'confirm' ? (
        <>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: '#F4F1EC', marginBottom: 10 }}>
            Verify your email
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 28px' }}>
            We&apos;ll send a sign-in code to <strong style={{ color: '#F4F1EC' }}>{maskedEmail}</strong>.
          </p>

          <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              onClick={sendCode}
              disabled={status === 'loading'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
                color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, minHeight: 48,
                padding: '15px 30px', borderRadius: 14, border: 'none',
                cursor: status === 'loading' ? 'default' : 'pointer',
                boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
              }}
            >
              {status === 'loading' ? 'Sending…' : 'Send code'}
            </button>
            <button
              type="button"
              onClick={onUseDifferentEmail}
              style={{ background: 'none', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 24px', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Use a different email
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: '#F4F1EC', marginBottom: 10 }}>
            Enter your code
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 24px' }}>
            We sent a code to <strong style={{ color: '#F4F1EC' }}>{maskedEmail}</strong>.
          </p>

          <form onSubmit={verify} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="12345678"
              aria-label="One-time code"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 12,
                border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)',
                color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 20, letterSpacing: '.3em',
                textAlign: 'center', padding: '0 16px', outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading' || !token.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
                color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, minHeight: 48,
                padding: '15px 30px', borderRadius: 14, border: 'none',
                cursor: status === 'loading' ? 'default' : 'pointer',
                boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
              }}
            >
              {status === 'loading' ? 'Verifying…' : 'Verify code'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setStep('confirm'); setStatus('idle'); setToken(''); setErrorMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Resend code
          </button>

          {status === 'error' && (
            <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>
              {errorMsg}
            </p>
          )}
        </>
      )}
    </div>
  );
}
