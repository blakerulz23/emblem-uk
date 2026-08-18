'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Manual only — there is no reliable "physically shipped" signal in this
 * codebase yet (production_status never reaches beyond ready_for_programming
 * in practice), so this never fires itself. Staff click it once they
 * actually know the card is on its way. Squad Invite cards only — normal
 * orders already get a claim code by email at approval time via a
 * separate, pre-existing flow (createGuardianInvite/createTeamInvite).
 */
export default function SendClaimReminderButton({ cardId, alreadySentAt }: { cardId: string; alreadySentAt: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const send = async () => {
    if (pending) return;
    setPending(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const response = await fetch(`/api/staff/cards/${cardId}/send-claim-reminder`, { method: 'POST' });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error || 'Could not send the reminder.');
        setMessageIsError(true);
        return;
      }
      setMessage('Reminder sent.');
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        onClick={send}
        disabled={pending}
        aria-busy={pending}
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
          color: 'var(--ink)', background: 'var(--surface)', border: 'none', cursor: pending ? 'wait' : 'pointer',
          padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap',
        }}
      >
        {pending ? 'Sending…' : alreadySentAt ? 'Resend claim reminder' : 'Send claim reminder'}
      </button>
      {alreadySentAt && !message && (
        <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 10.5, color: 'var(--ink-faint)' }}>
          Last sent {new Date(alreadySentAt).toLocaleString('en-GB')}
        </span>
      )}
      {message && (
        <p role={messageIsError ? 'alert' : 'status'} style={{ margin: 0, fontFamily: 'var(--font-manrope), system-ui', fontSize: 11, fontWeight: 600, color: messageIsError ? '#b91c1c' : '#047857' }}>
          {message}
        </p>
      )}
    </div>
  );
}
