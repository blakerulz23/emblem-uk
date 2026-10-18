'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveConfirmationPhrase,
  MAX_TEST_ARCHIVE_BATCH,
  restoreConfirmationPhrase,
  TEST_ARCHIVE_REFUSAL_LABELS,
  type TestArchiveResult,
} from '@/lib/test-archive';
import type { TestArchiveData } from './test-archive-data';

const box = { padding: '16px 18px', borderRadius: 16, background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)' } as const;
const label = { fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14, color: 'var(--ink)' } as const;
const small = { fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)' } as const;
const button = (tone: 'danger' | 'plain') => ({
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10,
  border: 'none', cursor: 'pointer', color: tone === 'danger' ? '#b91c1c' : 'var(--ink)',
  background: tone === 'danger' ? '#fef2f2' : 'var(--surface)',
}) as const;

/**
 * "Internal test cards": archive (single or bulk), Restore, and hide
 * refunded or cancelled test orders. Only rendered for staff holding
 * test_data_admin; every action is re-checked server-side and in the
 * database (migration 0088), which refuses anything with payment history
 * or that may physically exist, and audits every attempt.
 */
export default function TestArchivePanel({ candidates, archived, financialOrders }: TestArchiveData) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreSelected, setRestoreSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('Internal test card');
  const [typed, setTyped] = useState('');
  const [restoreTyped, setRestoreTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<TestArchiveResult[]>([]);
  const [hideOrder, setHideOrder] = useState<{ id: string; typed: string }>({ id: '', typed: '' });

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setMessage('');
    setResults([]);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { error?: string; results?: TestArchiveResult[] } | null;
      if (!res.ok) {
        setMessage(json?.error ?? 'Something went wrong');
        return false;
      }
      setResults(json?.results ?? []);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    const ok = await post('/api/staff/test-archive/archive', { cardIds: Array.from(selected), reason, confirmation: typed });
    if (ok) { setSelected(new Set()); setTyped(''); }
  };
  const restore = async () => {
    const ok = await post('/api/staff/test-archive/restore', { cardIds: Array.from(restoreSelected), confirmation: restoreTyped });
    if (ok) { setRestoreSelected(new Set()); setRestoreTyped(''); }
  };
  const hide = async () => {
    const ok = await post('/api/staff/test-archive/hide-order', { orderId: hideOrder.id, typedOrderRef: hideOrder.typed, reason });
    if (ok) { setHideOrder({ id: '', typed: '' }); setMessage('Order hidden from the queues. Its payment records are unchanged.'); }
  };

  const archivePhrase = archiveConfirmationPhrase(selected.size);
  const restorePhrase = restoreConfirmationPhrase(restoreSelected.size);

  return (
    <details style={{ ...box, marginTop: 40 }}>
      <summary style={{ ...label, cursor: 'pointer' }}>
        Internal test cards · {candidates.length} in queues · {archived.length} archived
      </summary>
      <p style={{ ...small, marginTop: 8 }}>
        Archiving hides a test card from the staff queues. Nothing is deleted, every action is logged, and Restore puts it back.
        Cards with payment history, programmed or verified cards, and cards claimed by a non-staff account are refused.
      </p>

      <label style={{ ...small, display: 'block', marginTop: 12 }}>
        Reason (logged)
        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />
      </label>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={label}>In the queues</span>
          <button type="button" style={button('plain')} onClick={() => setSelected(new Set(candidates.slice(0, MAX_TEST_ARCHIVE_BATCH).map((c) => c.id)))}>
            Select all{candidates.length > MAX_TEST_ARCHIVE_BATCH ? ` (first ${MAX_TEST_ARCHIVE_BATCH})` : ''}
          </button>
          <button type="button" style={button('plain')} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8 }}>
          {candidates.map((c) => (
            <label key={c.id} style={{ ...small, display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(selected, c.id, setSelected)} />
              <span>
                <strong>{c.playerName}</strong> · card {c.shortRef} · order {c.orderShortRef} ({c.orderStatus}) · {c.cardStatus} · {c.productionStatus}
              </span>
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>Type <strong>{archivePhrase}</strong> to confirm.</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />
            <button type="button" disabled={busy || typed !== archivePhrase} style={button('danger')} onClick={archive}>
              Archive selected ({selected.size})
            </button>
          </div>
        )}
      </div>

      {financialOrders.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <span style={label}>Refunded or cancelled test orders</span>
          <p style={small}>Hides the order&rsquo;s cards from the queues. Payment, refund and webhook records are never changed.</p>
          {financialOrders.map((o) => (
            <div key={o.id} style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0' }}>
              <span>order {o.shortRef} · {o.paymentStatus}{o.hadShopifyOrder ? ' · Shopify payment history' : ''} · {o.visibleCards} card(s)</span>
              {hideOrder.id === o.id ? (
                <>
                  <input placeholder={`Type ${o.shortRef}`} value={hideOrder.typed} onChange={(e) => setHideOrder({ id: o.id, typed: e.target.value })} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--line)' }} />
                  <button type="button" disabled={busy || hideOrder.typed.trim() !== o.shortRef} style={button('danger')} onClick={hide}>Hide test order</button>
                  <button type="button" style={button('plain')} onClick={() => setHideOrder({ id: '', typed: '' })}>Cancel</button>
                </>
              ) : (
                <button type="button" style={button('plain')} onClick={() => setHideOrder({ id: o.id, typed: '' })}>Hide refunded test order</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <span style={label}>Archived test cards</span>
        {archived.length === 0 && <p style={small}>None.</p>}
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
          {archived.map((c) => (
            <label key={c.id} style={{ ...small, display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <input type="checkbox" checked={restoreSelected.has(c.id)} onChange={() => toggle(restoreSelected, c.id, setRestoreSelected)} />
              <span>
                <strong>{c.playerName}</strong> · card {c.shortRef} · order {c.orderShortRef} · archived {new Date(c.archivedAt).toLocaleDateString('en-GB')}{c.reason ? ` · ${c.reason}` : ''}
              </span>
            </label>
          ))}
        </div>
        {restoreSelected.size > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>Type <strong>{restorePhrase}</strong> to confirm.</span>
            <input value={restoreTyped} onChange={(e) => setRestoreTyped(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />
            <button type="button" disabled={busy || restoreTyped !== restorePhrase} style={button('plain')} onClick={restore}>
              Restore selected ({restoreSelected.size})
            </button>
          </div>
        )}
      </div>

      {message && <p style={{ ...small, marginTop: 12, color: '#b91c1c' }}>{message}</p>}
      {results.length > 0 && (
        <ul style={{ ...small, marginTop: 12 }}>
          {results.map((r) => (
            <li key={r.cardId}>
              card {r.cardId.slice(0, 8)}: {r.result}{r.reason ? ` (${TEST_ARCHIVE_REFUSAL_LABELS[r.reason] ?? r.reason})` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
