'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BTN = {
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
  padding: '7px 12px', borderRadius: 10, border: '1px solid #d6d3d1', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const,
};
const FIELD = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #d6d3d1', width: 120 };

async function post(url: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  if (!res?.ok) return { ok: false, message: (json && typeof json.error === 'string' && json.error) || 'Something went wrong — try again.' };
  return { ok: true, message: json && typeof json.note === 'string' ? json.note : undefined };
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (url: string, body: unknown, confirmText?: string) => {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    setMessage(null);
    const result = await post(url, body);
    setBusy(false);
    if (result.message) setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  };
  const note = message ? <p style={{ fontSize: 12.5, marginTop: 6, color: message.ok ? '#065f46' : '#b91c1c' }}>{message.text}</p> : null;
  return { busy, run, note };
}

export function StatusActions({ partnerId, status }: { partnerId: string; status: string }) {
  const { busy, run, note } = useAction();
  const url = `/api/staff/partners/${partnerId}`;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {status === 'applied' && (
          <>
            <button type="button" disabled={busy} style={{ ...BTN, background: '#ecfdf5' }} onClick={() => run(url, { action: 'approve' }, 'Approve this creator? Check the vetting list in doc 44 first.')}>Approve</button>
            <button type="button" disabled={busy} style={{ ...BTN, color: '#b91c1c' }} onClick={() => run(url, { action: 'reject' }, 'Reject this application?')}>Reject</button>
          </>
        )}
        {status === 'active' && <button type="button" disabled={busy} style={BTN} onClick={() => run(url, { action: 'pause' }, 'Pause? New orders will not earn commission.')}>Pause</button>}
        {(status === 'paused' || status === 'rejected') && <button type="button" disabled={busy} style={BTN} onClick={() => run(url, { action: 'reactivate' }, 'Make this partner active?')}>Make active</button>}
      </div>
      {note}
    </div>
  );
}

export function RatesForm({ partnerId, commissionBps, customerDiscountBps }: { partnerId: string; commissionBps: number; customerDiscountBps: number }) {
  const { busy, run, note } = useAction();
  const [commission, setCommission] = useState(String(commissionBps / 100));
  const [discount, setDiscount] = useState(String(customerDiscountBps / 100));
  const toBps = (v: string) => Math.round(Number(v) * 100);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
        Commission % <input style={{ ...FIELD, width: 60 }} value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" />
        Customer discount % <input style={{ ...FIELD, width: 60 }} value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
        <button type="button" disabled={busy} style={BTN}
          onClick={() => run(`/api/staff/partners/${partnerId}`, { action: 'set_rates', commissionBps: toBps(commission), customerDiscountBps: toBps(discount) }, 'Save these rates? They apply to new orders and new codes.')}>
          Save rates
        </button>
      </div>
      {note}
    </div>
  );
}

export function AddCodeForm({ partnerId, discountPercent }: { partnerId: string; discountPercent: string }) {
  const { busy, run, note } = useAction();
  const [code, setCode] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={FIELD} placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
        <button type="button" disabled={busy || code.length < 3} style={BTN}
          onClick={() => run(`/api/staff/partners/${partnerId}`, { action: 'add_code', code },
            `Have you already created ${code} in Shopify Admin as ${discountPercent} off the UK card variant only, not combinable with other discounts? The percentage must match exactly.`)}>
          Record code
        </button>
      </div>
      {note}
    </div>
  );
}

export function CodeToggle({ partnerId, code, active }: { partnerId: string; code: string; active: boolean }) {
  const { busy, run, note } = useAction();
  return (
    <span>
      <button type="button" disabled={busy} style={{ ...BTN, padding: '3px 8px', fontSize: 11.5 }}
        onClick={() => run(`/api/staff/partners/${partnerId}`, { action: 'set_code_active', code, active: !active }, active ? `Switch off ${code}? Also deactivate it in Shopify Admin.` : `Switch ${code} back on?`)}>
        {active ? 'Switch off' : 'Switch on'}
      </button>
      {note}
    </span>
  );
}

export function NotesForm({ partnerId, notes }: { partnerId: string; notes: string }) {
  const { busy, run, note } = useAction();
  const [value, setValue] = useState(notes);
  return (
    <div>
      <textarea style={{ ...FIELD, width: '100%', minHeight: 56 }} value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000}
        placeholder="Vetting notes (business only, nothing about children)" />
      <button type="button" disabled={busy} style={{ ...BTN, marginTop: 4 }} onClick={() => run(`/api/staff/partners/${partnerId}`, { action: 'set_notes', notes: value })}>Save notes</button>
      {note}
    </div>
  );
}

export function CreatePayoutButton({ partnerId, amount }: { partnerId: string; amount: string }) {
  const { busy, run, note } = useAction();
  return (
    <div>
      <button type="button" disabled={busy} style={{ ...BTN, background: '#ecfdf5' }}
        onClick={() => run(`/api/staff/partners/${partnerId}/payout`, {}, `Create a payout of ${amount}? You then send the bank transfer yourself.`)}>
        Create payout ({amount})
      </button>
      {note}
    </div>
  );
}

export function MarkSentForm({ payoutId }: { payoutId: string }) {
  const { busy, run, note } = useAction();
  const [reference, setReference] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input style={FIELD} placeholder="Bank reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        <button type="button" disabled={busy || !reference.trim()} style={BTN}
          onClick={() => run(`/api/staff/partners/payouts/${payoutId}/sent`, { reference }, 'Mark this payout as sent?')}>
          Mark sent
        </button>
      </div>
      {note}
    </div>
  );
}
