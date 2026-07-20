'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Guardian settings — export or delete a linked player's data.
 *
 * Closes the ICO right-of-access and right-to-erasure gaps flagged as ❌
 * in docs/compliance/children-data-checklist.md. This is intentionally
 * a plain, unstyled page — the goal is that a data-subject request is
 * always one URL away, not buried inside a modal in the app shell.
 *
 * The download button hits GET /api/os/guardian/export/[playerId], which
 * returns JSON with 1-hour signed media links. The delete button hits
 * DELETE /api/os/guardian/delete-player/[playerId] with a confirmName
 * body that must match the player's name — that's the primary safety
 * guard, not a client-side confirm modal.
 */

type LinkedPlayer = { id: string; name: string };

export default function SettingsPage() {
  const [players, setPlayers] = useState<LinkedPlayer[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setSignedIn(Boolean(user));
    if (!user) return;
    const { data, error } = await supabase
      .from('guardians')
      .select('player:players ( id, name )')
      .eq('profile_id', user.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setPlayers(
      (data ?? [])
        .map((r: any) => r.player)
        .filter(Boolean) as LinkedPlayer[],
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportPlayer = async (playerId: string) => {
    setBusy(playerId);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/os/guardian/export/${playerId}`);
      if (!r.ok) throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emblem-os-export-${playerId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Export downloaded. Signed media URLs inside expire in 1 hour.`);
    } catch (e: any) {
      setErr(e?.message ?? 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const deletePlayer = async (playerId: string, name: string) => {
    const typed = window.prompt(
      `This will permanently delete ${name} and every moment, media file, and skill snapshot attached. There is no undo. Type the player's full name to confirm:`,
    );
    if (typed !== name) {
      setErr(
        typed === null
          ? null
          : 'Name did not match. Deletion cancelled.',
      );
      return;
    }
    setBusy(playerId);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/os/guardian/delete-player/${playerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: name }),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
      setMsg(`${name} has been deleted.`);
      setPlayers((p) => (p ?? []).filter((x) => x.id !== playerId));
    } catch (e: any) {
      setErr(e?.message ?? 'Deletion failed');
    } finally {
      setBusy(null);
    }
  };

  if (signedIn === false) {
    return (
      <Wrapper>
        <h1 style={h1}>Sign in required</h1>
        <p style={body}>
          You need to be signed in to manage the data of a child linked to
          your Emblem account. <a href="/os">Open Emblem OS</a> to sign in.
        </p>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <h1 style={h1}>Manage your child's data</h1>
      <p style={body}>
        You can download an export of everything Emblem OS stores about a
        player you're the guardian of, or permanently delete a player and
        all attached data. See our <a href="/os/privacy">privacy notice</a>{' '}
        for the wider policy.
      </p>

      {msg && <Notice tone="ok">{msg}</Notice>}
      {err && <Notice tone="err">{err}</Notice>}

      {players === null ? (
        <p style={body}>Loading…</p>
      ) : players.length === 0 ? (
        <p style={body}>You aren't listed as a guardian on any player yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
          {players.map((p) => (
            <li
              key={p.id}
              style={{
                padding: '18px 20px',
                background: '#fff',
                border: '1px solid #E8E4DE',
                borderRadius: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18, color: '#100E0C' }}>
                {p.name}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => exportPlayer(p.id)}
                  style={btnPrimary(busy === p.id)}
                >
                  {busy === p.id ? 'Working…' : 'Download data'}
                </button>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => deletePlayer(p.id, p.name)}
                  style={btnDanger(busy === p.id)}
                >
                  Delete permanently
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  );
}

const h1 = { fontSize: 28, fontWeight: 900, color: '#100E0C', marginBottom: 8 } as const;
const body = { fontSize: 15, color: '#4a4239', lineHeight: 1.6, marginBottom: 16 } as const;
const btnPrimary = (disabled: boolean) =>
  ({
    padding: '10px 16px',
    borderRadius: 10,
    background: '#E97435',
    color: '#fff',
    border: 'none',
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }) as const;
const btnDanger = (disabled: boolean) =>
  ({
    padding: '10px 16px',
    borderRadius: 10,
    background: 'transparent',
    color: '#C0392B',
    border: '1px solid rgba(210,60,50,.35)',
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }) as const;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 24px 96px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#100E0C',
      }}
    >
      {children}
    </main>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'err'; children: React.ReactNode }) {
  const bg = tone === 'ok' ? 'rgba(46,158,91,.08)' : 'rgba(210,60,50,.08)';
  const fg = tone === 'ok' ? '#1F7A3F' : '#C0392B';
  const border = tone === 'ok' ? 'rgba(46,158,91,.3)' : 'rgba(210,60,50,.3)';
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontSize: 13.5,
        margin: '12px 0 20px',
      }}
    >
      {children}
    </div>
  );
}
