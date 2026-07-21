'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';
import type { SeasonTarget } from '../playerProfile';

const DEMO_IDENTITY: [string, string][] = [
  ['Preferred position', 'Midfielder'],
  ['Strong foot', 'Right'],
  ['Squad number', '7'],
  ['Football age group', 'U10'],
  ['Favourite player', 'Kevin De Bruyne'],
  ['Football ambition', 'Play academy football'],
];

/** Reproduces the three demo presentation states from one shape: a literal fraction, a vague "in progress", or "Completed". */
function goalDisplay(g: SeasonTarget) {
  const pct = Math.min(100, Math.round((g.current / g.target) * 100));
  if (g.status === 'completed') return { val: 'Completed', valColor: '#2E9E5B', bar: '#2E9E5B', pct };
  if (g.unit) return { val: `${g.current} / ${g.target}`, valColor: '#15130F', bar: 'linear-gradient(90deg,#F26722,#E97435)', pct };
  return { val: 'In progress', valColor: '#2A6FDB', bar: '#2A6FDB', pct };
}

export default function Profile({ actions }: { actions: OsActions }) {
  const router = useRouter();
  const { mode, playerId, playerProfile, connections, goals, viewerId } = useOsData();
  const isReal = mode !== 'demo';
  const identityRows: [string, string][] = isReal
    ? [
        ['Preferred position', playerProfile.position || 'Not set'],
        ['Strong foot', playerProfile.preferredFoot],
        ['Squad number', playerProfile.squadNumber != null ? String(playerProfile.squadNumber) : 'Not set'],
        ['Football age group', playerProfile.ageGroup ?? 'Not set'],
        ['Favourite player', playerProfile.favouritePlayer ?? 'Not set'],
        ['Football ambition', playerProfile.footballAmbition ?? 'Not set'],
      ]
    : DEMO_IDENTITY;
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [showEdit, setShowEdit] = useState(false);
  const [favouritePlayer, setFavouritePlayer] = useState(playerProfile.favouritePlayer ?? '');
  const [footballAmbition, setFootballAmbition] = useState(playerProfile.footballAmbition ?? '');
  const [editStatus, setEditStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !playerId || uploadingPhoto) return;
    setUploadingPhoto(true);
    const form = new FormData();
    form.append('file', file);
    await fetch(`/api/os/players/${playerId}/photo`, { method: 'POST', body: form });
    setUploadingPhoto(false);
    router.refresh();
  };

  const saveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || editStatus === 'saving') return;
    setEditStatus('saving');
    const res = await fetch(`/api/os/players/${playerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favouritePlayer, footballAmbition }),
    });
    if (!res.ok) {
      setEditStatus('error');
      return;
    }
    setEditStatus('idle');
    setShowEdit(false);
    router.refresh();
  };

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalLabel, setGoalLabel] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalUnit, setGoalUnit] = useState('');
  const [addGoalStatus, setAddGoalStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [goalUpdateStatus, setGoalUpdateStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !goalLabel.trim() || addGoalStatus === 'sending') return;
    const target = Number(goalTarget);
    if (!target || target <= 0) return;
    setAddGoalStatus('sending');
    const res = await fetch('/api/os/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, label: goalLabel.trim(), target, unit: goalUnit.trim() || undefined }),
    });
    if (!res.ok) {
      setAddGoalStatus('error');
      return;
    }
    setAddGoalStatus('idle');
    setShowAddGoal(false);
    setGoalLabel('');
    setGoalTarget('');
    setGoalUnit('');
    router.refresh();
  };

  const saveGoalProgress = async (goalId: string) => {
    const current = Number(editingValue);
    if (Number.isNaN(current) || goalUpdateStatus === 'saving') return;
    setGoalUpdateStatus('saving');
    const res = await fetch(`/api/os/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current }),
    });
    if (!res.ok) {
      setGoalUpdateStatus('error');
      return;
    }
    setGoalUpdateStatus('idle');
    setEditingGoalId(null);
    router.refresh();
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !inviteEmail.trim()) return;
    setInviteStatus('sending');
    const res = await fetch('/api/os/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, invitedEmail: inviteEmail.trim() }),
    });
    setInviteStatus(res.ok ? 'sent' : 'error');
  };

  return (
    <>
      <div onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ background: 'var(--os-card)', borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {isReal && !playerProfile.photoUrl ? (
            <div
              onClick={() => photoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Add a photo"
              data-tiltz="26"
              style={{ width: 96, height: 120, borderRadius: 14, flex: '0 0 auto', position: 'relative', overflow: 'hidden', border: '2px dashed var(--os-border)', background: 'var(--os-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            >
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhotoChange} style={{ display: 'none' }} />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 10.5, color: 'var(--os-ink)', textAlign: 'center' }}>{uploadingPhoto ? 'Uploading…' : 'Add photo'}</span>
            </div>
          ) : (
            <div data-tiltz="26" style={{ width: 96, height: 120, borderRadius: 14, background: 'linear-gradient(160deg,#E9C46A,#C98B3A)', flex: '0 0 auto', position: 'relative', overflow: 'hidden' }}>
              <img
                src={isReal && playerProfile.photoUrl ? playerProfile.photoUrl : `${osAssetPath}/player-ollie.png`}
                alt={playerProfile.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
              />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: 'var(--os-ink)' }}>{playerProfile.name.toUpperCase()}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#E97435"><path d="M12 1l2.5 2.2 3.3-.4 1 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-1 3.2-3.3-.4L12 23l-2.5-2.2-3.3.4-1-3.2-3-1.5 1.2-3.1L2.2 10l3-1.5 1-3.2 3.3.4z" /><path d="M9.5 12.5l1.8 1.8 3.5-3.8" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 13, color: '#E97435', margin: '2px 0 8px' }}>{playerProfile.position}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {!isReal && <img src={`${osAssetPath}/club-badge.png`} alt={playerProfile.club} style={{ width: 26, height: 26, objectFit: 'contain', flex: '0 0 auto' }} />}
              <div><div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: 'var(--os-ink)' }}>{playerProfile.club}</div>{!isReal && <div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Manchester, England</div>}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--os-border)', borderBottom: '1px solid var(--os-border)', padding: '12px 0', marginBottom: 14 }}>
          <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>MEMBER SINCE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.memberSinceYear ?? '—'}</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SQUAD NUMBER</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.squadNumber ?? '—'}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SEASON</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.season ?? '—'}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>Share</div>
          <div
            role="button"
            tabIndex={0}
            onClick={isReal ? () => setShowEdit((v) => !v) : undefined}
            style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, background: '#E97435', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#fff', cursor: isReal ? 'pointer' : 'default' }}
          >
            Edit
          </div>
        </div>
        {isReal && showEdit && (
          <form onSubmit={saveIdentity} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={favouritePlayer}
              onChange={(e) => setFavouritePlayer(e.target.value)}
              placeholder="Favourite player"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
            />
            <input
              type="text"
              value={footballAmbition}
              onChange={(e) => setFootballAmbition(e.target.value)}
              placeholder="Football ambition"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
            />
            <button
              type="submit"
              disabled={editStatus === 'saving'}
              style={{ padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: editStatus === 'saving' ? 'default' : 'pointer' }}
            >
              {editStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {editStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', margin: 0 }}>Could not save — try again.</p>}
          </form>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>CURRENT CLUB</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!isReal && (
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxShadow: '0 4px 12px -4px rgba(0,0,0,.25)' }}>
              <img src={`${osAssetPath}/club-badge.png`} alt={playerProfile.club} style={{ width: 50, height: 50, objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{playerProfile.club || 'No club yet'}</div>
            <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>{playerProfile.position}{playerProfile.squadNumber != null ? ` · Number ${playerProfile.squadNumber}` : ''}</div>
          </div>
        </div>
        <div onClick={actions.goTeam} role="button" aria-label="View Club" tabIndex={0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--os-border)', cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#E97435' }}>
          View Club<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>FOOTBALL IDENTITY</div>
        {identityRows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ fontSize: 13.5, color: '#6B6357' }}>{k}</span>
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: '#E97435' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>{isReal ? 'SEASON GOALS' : '2026 SEASON GOALS'}</div>
        {isReal && goals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>No season goals yet.</div>
            <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 4 }}>A coach or guardian can add one.</div>
          </div>
        )}
        {goals.map((g) => {
          const { val, valColor, bar, pct } = goalDisplay(g);
          const canEdit = isReal && g.id && g.createdBy === viewerId;
          return (
            <div key={g.id ?? g.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{g.label}</span>
                <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: valColor }}>{val}</span>
              </div>
              <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: bar, borderRadius: 5 }} /></div>
              {canEdit && (
                editingGoalId === g.id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="number"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      style={{ width: 80, boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => saveGoalProgress(g.id!)}
                      disabled={goalUpdateStatus === 'saving'}
                      style={{ padding: '7px 14px', borderRadius: 8, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                    >
                      {goalUpdateStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { setEditingGoalId(g.id!); setEditingValue(String(g.current)); setGoalUpdateStatus('idle'); }}
                    style={{ marginTop: 6, fontSize: 12, color: '#E97435', fontFamily: 'Roboto', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Update progress
                  </div>
                )
              )}
            </div>
          );
        })}
        {isReal && (
          <div style={{ marginTop: showAddGoal ? 0 : 8 }}>
            {!showAddGoal ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowAddGoal(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 11, border: '1px dashed var(--os-border)', color: '#E97435', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                + Add a goal
              </div>
            ) : (
              <form onSubmit={addGoal} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  required
                  value={goalLabel}
                  onChange={(e) => setGoalLabel(e.target.value)}
                  placeholder="Goal (e.g. Keep 8 clean sheets)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    required
                    min={1}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Target (e.g. 8)"
                    style={{ flex: 1, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                  />
                  <input
                    type="text"
                    value={goalUnit}
                    onChange={(e) => setGoalUnit(e.target.value)}
                    placeholder="Unit (optional)"
                    style={{ flex: 1, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={addGoalStatus === 'sending'}
                  style={{ padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: addGoalStatus === 'sending' ? 'default' : 'pointer' }}
                >
                  {addGoalStatus === 'sending' ? 'Adding…' : 'Add goal'}
                </button>
                {addGoalStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', margin: 0 }}>Could not add goal — try again.</p>}
              </form>
            )}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>CONNECTIONS &amp; PRIVACY</div>
        {connections.filter((c) => c.kind === 'guardian').map((c) => (
          <div key={c.profileId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#d9a679,#b07344)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Managed by</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{c.displayName ?? 'Guardian'}</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>{c.relationship ?? 'Guardian'}</div></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>
        ))}
        {connections.filter((c) => c.kind === 'coach').map((c) => (
          <div key={c.profileId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Coach access</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{c.displayName ?? 'Coach'}</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Coach</div></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6357" strokeWidth={1.8}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Profile visibility</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>Private</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Approved family &amp; team only</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
        {mode === 'demo' || !showInvite ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowInvite(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, padding: 13, borderRadius: 12, background: 'rgba(233,116,53,.1)', border: '1px solid rgba(233,116,53,.3)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4501C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 3 1M18 8v6M21 11h-6" /></svg>
            Invite family or coach
          </div>
        ) : (
          <form onSubmit={sendInvite} style={{ marginTop: 14 }}>
            {inviteStatus === 'sent' ? (
              <p style={{ fontSize: 13, color: '#2E9E5B', textAlign: 'center' }}>Invite sent to {inviteEmail}.</p>
            ) : (
              <>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Their email address"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14, marginBottom: 8 }}
                />
                <button
                  type="submit"
                  disabled={inviteStatus === 'sending'}
                  style={{ width: '100%', padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: inviteStatus === 'sending' ? 'default' : 'pointer' }}
                >
                  {inviteStatus === 'sending' ? 'Sending…' : 'Send invite'}
                </button>
                {inviteStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', marginTop: 6 }}>Could not send the invite — try again.</p>}
              </>
            )}
          </form>
        )}
      </div>
    </>
  );
}
