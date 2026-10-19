'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from '@/lib/print-capture';
import { postJson } from '@/lib/builder-authority-client';
import type { RecoverableOrder } from '@/lib/unpaid-order-recovery';

/**
 * "Pay for an order you've already sent" — /builder?pay=1.
 *
 * Verify email (existing builder-authority code endpoints) → list this
 * adult's own unpaid orders (/api/orders/unpaid, fresh code required) →
 * "Continue to payment" through the EXISTING /api/orders/[id]/checkout and
 * /payment-status routes, exactly as the builder's own payment step does.
 * Nothing here creates an order or sets a price.
 *
 * Duplicate-charge care: one order is opened at a time; an order whose
 * checkout was already opened before is re-checked server-side right
 * before a new checkout opens (paid → no checkout), and the parent is told
 * not to pay again if another tab may still be open. A second payment that
 * still gets through is flagged to staff by the orders/paid webhook.
 */
type Phase = 'email' | 'code' | 'loading' | 'list' | 'error';
type OrderState = 'idle' | 'opening' | 'awaiting' | 'paid' | 'closed' | 'error';

export function formatPence(pence: number, currency: string): string {
  const amount = (pence / 100).toFixed(2);
  return currency === 'GBP' ? `£${amount}` : `${amount} ${currency}`;
}

export function orderLabel(order: RecoverableOrder): string {
  const who = order.playerFirstNames.length ? order.playerFirstNames.join(', ') : `${order.cardCount} card${order.cardCount === 1 ? '' : 's'}`;
  const when = new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${who} · sent ${when}`;
}

async function readPaymentStatus(orderId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/orders/${orderId}/payment-status`, { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    return response.ok && result?.ok ? String(result.paymentStatus) : null;
  } catch {
    return null;
  }
}

export default function PaymentRecovery() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState<RecoverableOrder[]>([]);
  const [states, setStates] = useState<Record<string, OrderState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const openingRef = useRef(false);

  const setOrderState = (id: string, state: OrderState) => setStates((s) => ({ ...s, [id]: state }));

  const loadOrders = useCallback(async () => {
    setPhase('loading');
    setMessage('');
    try {
      const response = await fetch('/api/orders/unpaid', { method: 'POST', headers: { [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() } });
      const result = await response.json().catch(() => null);
      if (response.status === 401) {
        setPhase('email');
        return;
      }
      if (!response.ok || !result?.ok) {
        setMessage(result?.error || 'We couldn’t load your orders. Please try again.');
        setPhase('error');
        return;
      }
      setOrders(result.orders as RecoverableOrder[]);
      setPhase('list');
    } catch {
      setMessage('We couldn’t load your orders. Please check your connection and try again.');
      setPhase('error');
    }
  }, []);

  // A session verified in the last 30 minutes goes straight to the list;
  // anything else (none, or older) is asked for a new code.
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMessage('Enter the email you used when you made the card.'); return; }
    setBusy(true); setMessage('');
    const result = await postJson('/api/builder-authority/request-code', { email: email.trim() });
    setBusy(false);
    if (!result.ok) { setMessage(result.error || 'We couldn’t send a code. Please try again.'); return; }
    setPhase('code');
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    const result = await postJson('/api/builder-authority/verify-code', { email: email.trim(), code: code.trim() });
    setBusy(false);
    if (!result.ok) { setMessage('That code didn’t work. Check it, or send a new one.'); return; }
    setCode('');
    await loadOrders();
  };

  const continueToPayment = async (order: RecoverableOrder) => {
    if (openingRef.current) return; // one checkout at a time
    openingRef.current = true;
    // Opened blank inside the tap so Safari doesn't block it (same as the builder).
    let tab: Window | null = null;
    try { tab = window.open('', '_blank'); if (tab) tab.opener = null; } catch { tab = null; }
    setOrderState(order.orderId, 'opening');
    setErrors((e) => ({ ...e, [order.orderId]: '' }));
    try {
      if (order.checkoutStarted) {
        const status = await readPaymentStatus(order.orderId);
        if (status === 'paid' || status === 'fulfilled') { tab?.close(); setOrderState(order.orderId, 'paid'); return; }
      }
      const response = await fetch(`/api/orders/${order.orderId}/checkout`, { method: 'POST', headers: { [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() } });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && /already been paid/i.test(result?.error ?? '')) { tab?.close(); setOrderState(order.orderId, 'paid'); return; }
      if (!response.ok || !result?.ok || typeof result.checkoutUrl !== 'string') {
        tab?.close();
        setOrderState(order.orderId, response.status === 409 ? 'closed' : 'error');
        setErrors((e) => ({ ...e, [order.orderId]: result?.error || 'Could not start secure checkout. Please try again.' }));
        return;
      }
      setLinks((l) => ({ ...l, [order.orderId]: result.checkoutUrl }));
      if (tab) tab.location.href = result.checkoutUrl;
      setOrderState(order.orderId, 'awaiting');
    } catch {
      tab?.close();
      setOrderState(order.orderId, 'error');
      setErrors((e) => ({ ...e, [order.orderId]: 'Could not start secure checkout. Please check your connection and try again.' }));
    } finally {
      openingRef.current = false;
    }
  };

  // Only the server's webhook-recorded status ever marks an order paid.
  const awaiting = Object.entries(states).filter(([, s]) => s === 'awaiting').map(([id]) => id).join(',');
  useEffect(() => {
    if (!awaiting) return;
    let cancelled = false;
    const poll = async () => {
      for (const id of awaiting.split(',')) {
        const status = await readPaymentStatus(id);
        if (!cancelled && (status === 'paid' || status === 'fulfilled')) setOrderState(id, 'paid');
      }
    };
    void poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [awaiting]);

  const anyOpening = Object.values(states).includes('opening');

  return (
    <main className="uk-wizard-shell uk-pay-recovery">
      <div className="uk-wizard-phone">
      <header className="uk-wizard-header">
        <div className="uk-wizard-topbar">
          <a href="/" className="uk-pay-brand" aria-label="Emblem home">EMBLEM</a>
        </div>
      </header>
      <section className="uk-wizard-panel">
        <p className="uk-wizard-kicker">Already sent your card?</p>
        <h1>Pay for an order you&apos;ve already sent</h1>
        <p className="uk-wizard-copy">
          If you sent a card but didn&apos;t finish paying, you can pay for that same order here. You won&apos;t
          need to make the card again.
        </p>

        <div className="uk-adult-permission-card">
          {phase === 'loading' && <p className="uk-wizard-copy" role="status">Loading&hellip;</p>}

          {phase === 'email' && (
            <form onSubmit={requestCode}>
              <p className="uk-wizard-copy">To keep orders private, we&apos;ll email you a code first. Use the email you gave when you made the card.</p>
              <label>
                Your email
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              {message && <p className="uk-enquiry-error" role="alert">{message}</p>}
              <button type="submit" className="uk-wizard-primary" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
            </form>
          )}

          {phase === 'code' && (
            <form onSubmit={verifyCode}>
              <p className="uk-wizard-copy">We&apos;ve sent a code to {email}.</p>
              <label>
                Verification code
                <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              {message && <p className="uk-enquiry-error" role="alert">{message}</p>}
              <button type="submit" className="uk-wizard-primary" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button>
              <button type="button" className="uk-adult-permission-back" onClick={() => { setPhase('email'); setMessage(''); }} disabled={busy}>Use a different email or send a new code</button>
            </form>
          )}

          {phase === 'error' && (
            <div>
              <p className="uk-enquiry-error" role="alert">{message}</p>
              <button type="button" className="uk-wizard-primary" onClick={() => void loadOrders()}>Try again</button>
            </div>
          )}

          {phase === 'list' && orders.length === 0 && (
            <div className="uk-pay-empty">
              <p className="uk-wizard-copy"><strong>No unpaid orders found for this email.</strong></p>
              <p className="uk-wizard-copy">
                We show orders sent in the last 30 days that haven&apos;t been paid for. If you think something&apos;s
                missing, email <a href="mailto:hello@emblem.cards">hello@emblem.cards</a>.
              </p>
            </div>
          )}

          {phase === 'list' && orders.length > 0 && (
            <ul className="uk-pay-list" aria-label="Your unpaid orders">
              {orders.map((order) => {
                const state = states[order.orderId] ?? 'idle';
                return (
                  <li key={order.orderId} className={`uk-pay-order uk-pay-${state}`}>
                    <div className="uk-pay-order-head">
                      <strong>{orderLabel(order)}</strong>
                      <span>{formatPence(order.totalPence, order.currency)} + delivery</span>
                    </div>
                    <small className="uk-pay-ref">Order {order.orderRef}</small>
                    {order.checkoutStarted && state !== 'paid' && (
                      <p className="uk-pay-warning">
                        A payment was started for this order before. If you finished paying in another tab, please
                        don&apos;t pay again. It can take a few minutes to show here.
                      </p>
                    )}
                    {state === 'paid' && <p className="uk-pay-done" role="status">Paid. Thank you! You&apos;ll get a confirmation email from Shopify.</p>}
                    {state === 'awaiting' && (
                      <p className="uk-pay-awaiting" role="status">
                        Secure checkout is open in a new tab. This page will update when your payment is confirmed.
                        {links[order.orderId] && <> If the tab didn&apos;t open, <a href={links[order.orderId]} target="_blank" rel="noopener noreferrer">open secure checkout</a>.</>}
                      </p>
                    )}
                    {errors[order.orderId] && <p className="uk-enquiry-error" role="alert">{errors[order.orderId]}</p>}
                    {(state === 'idle' || state === 'error') && (
                      <button type="button" className="uk-wizard-primary" disabled={anyOpening} onClick={() => void continueToPayment(order)}>
                        Continue to payment
                      </button>
                    )}
                    {state === 'opening' && <button type="button" className="uk-wizard-primary" disabled>Opening secure checkout&hellip;</button>}
                  </li>
                );
              })}
            </ul>
          )}

          <a className="uk-adult-permission-back" href="/builder">Make a new card instead</a>
        </div>
      </section>
      </div>
    </main>
  );
}
