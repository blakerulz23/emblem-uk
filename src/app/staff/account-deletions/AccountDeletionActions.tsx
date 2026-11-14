'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AccountDeletionPanel, { type PanelMode, type PanelStage } from './AccountDeletionPanel';
import { COMPLETE_CONFIRMATION, describeCompletion, describeRejection, type ActionResult, type DeletionPreview } from '@/lib/staff-account-deletion';

/**
 * State and calls for one AccountDeletionPanel. The server decides everything;
 * this only sends the reason (and, for a permanent completion, the second
 * confirmation). Each mode has its own route:
 *   review         .../reject (reject + restore) or .../complete
 *   retry-sign-in  .../retry-sign-in (refused unless completed and erased)
 *   retry-restore  .../reject with mode restore-only (refused unless still rejected)
 */
export default function AccountDeletionActions({ id, mode, preview }: { id: string; mode: PanelMode; preview: DeletionPreview | null }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [stage, setStage] = useState<PanelStage>('choose');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    return { status: res?.status ?? 0, json };
  };

  const run = async (kind: 'reject' | 'complete') => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const base = `/api/staff/account-deletions/${id}`;
    if (kind === 'reject') {
      const { status, json } = await post(`${base}/reject`, mode === 'retry-restore' ? { reason, mode: 'restore-only' } : { reason });
      setResult(describeRejection(status, json));
    } else {
      const { status, json } =
        mode === 'retry-sign-in' ? await post(`${base}/retry-sign-in`, { reason }) : await post(`${base}/complete`, { reason, confirm: COMPLETE_CONFIRMATION });
      setResult(describeCompletion(status, json));
    }
    setBusy(false);
    setStage('choose');
    setTyped('');
  };

  return (
    <AccountDeletionPanel
      idPrefix={`deletion-${id}`}
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
