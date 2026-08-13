'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SafeSquadInviteProjection } from '@/lib/squad-invite-link';

export default function JoinSquadInvite({ invitation, csrfToken }: { invitation: SafeSquadInviteProjection; csrfToken: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'ready'|'email'|'code'>('ready');
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    const response = await fetch('/api/squad-invite-links/participation', { method: 'POST', headers: { 'X-Emblem-CSRF': csrfToken } });
    if (response.status === 401) { setStep('email'); return; }
    if (!response.ok) { setError('This Squad Invite is unavailable.'); return; }
    const result = await response.json() as { participationId: string };
    router.push(`/builder?squadParticipation=${encodeURIComponent(result.participationId)}`);
  };
  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const response = await fetch('/api/squad-invite-auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken }, body: JSON.stringify({ email: email.trim() }) });
    if (!response.ok && response.status !== 429) { setError('We could not send a verification code.'); return; }
    if (response.status === 429) { setError('Please wait before requesting another code.'); return; }
    setStep('code');
  };
  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const response = await fetch('/api/squad-invite-auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken }, body: JSON.stringify({ email: email.trim(), code: code.trim(), returnTo: '/squad-invite/join' }) });
    if (!response.ok) { setError('That verification code was not accepted.'); return; }
    await start();
  };

  return <main style={{ minHeight: '100vh', background: '#f5f0e8', color: '#17251d', padding: '32px 18px' }}>
    <section style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 24, padding: 28 }}>
      <p style={{ letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800, color: '#36754a' }}>Emblem Squad Invite</p>
      <h1>{invitation.teamName}</h1>
      <p>{invitation.ageGroup} · Deadline {new Date(invitation.deadlineAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
      <p><strong>{invitation.completedCommitments}</strong> completed commitments · Current incentive: <strong>{invitation.currentIncentive}</strong></p>
      <p>{invitation.productSummary}</p>
      <p>{invitation.deliverySummary}</p>
      <h2>One team link. Each parent or guardian builds and pays individually.</h2>
      <p>Email verification confirms control of the address only. A separate authority declaration is required before submitting a child&apos;s information.</p>
      {step === 'ready' && <button onClick={start} style={{ width: '100%', border: 0, borderRadius: 999, padding: 16, background: '#173f2a', color: '#fff', fontWeight: 800 }}>Create your child’s card for this team order</button>}
      {step === 'email' && <form onSubmit={sendCode}><label>Email address<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button>Send verification code</button></form>}
      {step === 'code' && <form onSubmit={verifyCode}><label>Verification code<input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></label><button>Verify and continue</button></form>}
      {error && <p role="alert">{error}</p>}
    </section>
  </main>;
}
