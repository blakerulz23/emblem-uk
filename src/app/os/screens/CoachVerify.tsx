'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOsData } from '../OsDataContext';

/**
 * Coach's review queue for parent-submitted moments awaiting approval.
 *
 * This screen was cosmetic before the moderation gate landed — it read
 * from a static VERIFY_QUEUE constant in data.tsx and the Approve/Reject
 * buttons did nothing. Post-gate: it queries real `moments` rows in the
 * pending state that belong to players on any team this coach is assigned
 * to, and Approve/Reject POST to /api/os/moments/[id]/moderate.
 *
 * RLS does the actual filtering — the coach-team assignment check lives
 * in 0001_init.sql's "moments: coaches can verify/update for their team"
 * policy. If a coach isn't assigned to a team, they see zero rows here,
 * not an error.
 *
 * The demo VERIFY_QUEUE from useOsData is used as a fallback when
 * `moments` is empty AND when Supabase is not configured (dev-mode without
 * env vars) so the screen still shows something for local development —
 * anything real is always shown first.
 */

type PendingMoment = {
  id: string;
  title: string;
  created_at: string;
  player: { id: string; name: string } | null;
  uploader: { display_name: string | null } | null;
};

export default function CoachVerify() {
  const { verifyQueue: DEMO_QUEUE } = useOsData();
  const [pending, setPending] = useState<PendingMoment[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from('moments')
        .select(
          `id, title, created_at,
           player:players ( id, name ),
           uploader:profiles!moments_uploaded_by_fkey ( display_name )`,
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (qErr) throw qErr;
      setPending((data as unknown as PendingMoment[]) ?? []);
    } catch (e: any) {
      // Missing env vars in local dev throw here — fall back to demo queue.
      setPending(null);
      setError(e?.message ?? 'Could not load pending moments');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/os/moments/${id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
      // Optimistic update — no need to re-query the whole list
      setPending((cur) => (cur ?? []).filter((m) => m.id !== id));
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  // Real data present → show real. Empty real list → show demo so the
  // screen isn't blank during onboarding. Explicit null → API failed.
  const showingDemo = !pending || pending.length === 0;
  const rows = showingDemo
    ? DEMO_QUEUE.map((v) => ({
        id: `demo-${v.moment}`,
        title: v.moment,
        player: v.player,
        submittedBy: v.by,
        date: v.date,
        thumb: v.thumb,
        isDemo: true,
      }))
    : pending!.map((m) => ({
        id: m.id,
        title: m.title,
        player: m.player?.name ?? 'Unknown player',
        submittedBy: m.uploader?.display_name ?? 'Parent',
        date: new Date(m.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
        thumb: null,
        isDemo: false,
      }));

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: 'Roboto',
            fontWeight: 900,
            fontSize: 22,
            color: 'var(--os-ink)',
            lineHeight: 1.1,
          }}
        >
          Verify moments
        </div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>
          Approved moments receive the Coach Verified badge.
          {showingDemo && (pending?.length === 0)
            ? ' No pending submissions right now.'
            : ''}
        </div>
        {error && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(210,60,50,.08)',
              color: '#C0392B',
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}
      </div>
      {rows.map((v) => (
        <div
          key={v.id}
          style={{
            background: 'var(--os-card)',
            borderRadius: 18,
            padding: 14,
            boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)',
            marginBottom: 14,
            opacity: v.isDemo ? 0.75 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                overflow: 'hidden',
                flex: '0 0 auto',
                position: 'relative',
                background: '#100E0C',
              }}
            >
              {v.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumb}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'Roboto',
                  fontWeight: 800,
                  fontSize: 15,
                  color: 'var(--os-ink)',
                }}
              >
                {v.title}
              </div>
              <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 1 }}>{v.player}</div>
              <div style={{ fontSize: 11.5, color: 'var(--os-muted)', marginTop: 3 }}>
                Submitted by {v.submittedBy} · {v.date}
                {v.isDemo && ' · demo'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              disabled={v.isDemo || busy === v.id}
              onClick={() => moderate(v.id, 'approve')}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: 11,
                borderRadius: 11,
                background: '#E97435',
                color: '#fff',
                fontFamily: 'Roboto',
                fontWeight: 800,
                fontSize: 13,
                cursor: v.isDemo ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 18px -10px rgba(233,116,53,.7)',
                border: 'none',
                opacity: busy === v.id ? 0.6 : 1,
              }}
            >
              {busy === v.id ? '...' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={v.isDemo || busy === v.id}
              onClick={() => moderate(v.id, 'reject')}
              style={{
                flex: '0 0 auto',
                textAlign: 'center',
                padding: '11px 16px',
                borderRadius: 11,
                border: '1px solid rgba(210,60,50,.3)',
                background: 'transparent',
                color: '#C0392B',
                fontFamily: 'Roboto',
                fontWeight: 800,
                fontSize: 13,
                cursor: v.isDemo ? 'not-allowed' : 'pointer',
                opacity: busy === v.id ? 0.6 : 1,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
