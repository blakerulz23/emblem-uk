'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SafeSquadInviteProjection } from '@/lib/squad-invite-link';

export default function JoinSquadInvite({ invitation }: { invitation: SafeSquadInviteProjection }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'ready'|'email'|'code'>('ready');
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    const response = await fetch('/api/squad-invite-links/participation', { method: 'POST' });
    if (response.status === 401) { setStep('email'); return; }
    if (!response.ok) { setError('This Squad Invite is unavailable.'); return; }
    const result = await response.json() as { participationId: string };
    router.push(`/builder?squadParticipation=${encodeURIComponent(result.participationId)}`);
  };
  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const { error: authError } = await createClient().auth.signInWithOtp({ email: email.trim() });
    if (authError) { setError('We could not send a verification code.'); return; }
    setStep('code');
  };
  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const { error: authError } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (authError) { setError('That verification code was not accepted.'); return; }
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
      <h2>One team link. Each parent builds and pays individually.</h2>
      <p>Your child’s information is submitted privately to Emblem and is not shown to the organiser or other parents.</p>
      {step === 'ready' && <button onClick={start} style={{ width: '100%', border: 0, borderRadius: 999, padding: 16, background: '#173f2a', color: '#fff', fontWeight: 800 }}>Create your child’s card for this team order</button>}
      {step === 'email' && <form onSubmit={sendCode}><label>Email address<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button>Send verification code</button></form>}
      {step === 'code' && <form onSubmit={verifyCode}><label>Verification code<input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></label><button>Verify and continue</button></form>}
      {error && <p role="alert">{error}</p>}
    </section>
  </main>;
}
