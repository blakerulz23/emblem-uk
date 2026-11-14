'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AccountDeletionPanel, { type PanelStage } from './AccountDeletionPanel';
import { COMPLETE_CONFIRMATION, describeCompletion, describeRejection, type ActionResult, type DeletionPreview } from '@/lib/staff-account-deletion';

/** State and calls for one AccountDeletionPanel. The server decides everything; this only sends the reason and confirmation. */
export default function AccountDeletionActions({ id, mode, preview }: { id: string; mode: 'review' | 'retry-sign-in'; preview: DeletionPreview | null }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [stage, setStage] = useState<PanelStage>('choose');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : { error: 'Could not reach the server. Nothing was confirmed; refresh and check before trying again.' };
    return { status: res?.status ?? 0, json };
  };

  const run = async (kind: 'reject' | 'complete') => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const { status, json } =
      kind === 'reject'
        ? await post(`/api/staff/account-deletions/${id}/reject`, { reason })
        : await post(`/api/staff/account-deletions/${id}/complete`, { reason, confirm: COMPLETE_CONFIRMATION });
    setResult(kind === 'reject' ? describeRejection(status, json) : describeCompletion(status, json));
    setBusy(false);
    setStage('choose');
    setTyped('');
  };

  return (
    <AccountDeletionPanel
      mode={mode}
      preview={preview}
      reason={reason}
      stage={stage}
      typed={typed}
      busy={busy}
      result={result}
      onReason={setReason}
      onStage={(s) => {
        setResult(null);
        setTyped('');
        setStage(s);
      }}
      onTyped={setTyped}
      onReject={() => run('reject')}
      onComplete={() => run('complete')}
      onRefresh={() => router.refresh()}
    />
  );
}
