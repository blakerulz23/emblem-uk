'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react';
import { ADD_ACH, ICN, fmtFileSize, osAssetPath } from './data';
import { initialOsState } from './types';
import type { AttrCategory, CardBackTab, OsState, Tab } from './types';
import { OsDataProvider, DEMO_OS_DATA } from './OsDataContext';
import type { OsData } from './OsDataContext';

import ActivationGate from './overlays/ActivationGate';
import MomentStage from './overlays/MomentStage';
import CollectibleViewer from './overlays/CollectibleViewer';
import AddMomentFlow from './overlays/AddMomentFlow';
import CelebrateSheet from './overlays/CelebrateSheet';

import PlayerHome from './screens/PlayerHome';
import Journey from './screens/Journey';
import RealJourney from './screens/RealJourney';
import CardScreen from './screens/Card';
import Team from './screens/Team';
import Profile from './screens/Profile';
import CoachHome from './screens/CoachHome';
import CoachTeam from './screens/CoachTeam';
import CoachCelebrate from './screens/CoachCelebrate';
import CoachVerify from './screens/CoachVerify';
import CoachProfile from './screens/CoachProfile';

export type OsActions = {
  activate: () => void;
  toggleDark: () => void;
  setTab: (t: Tab) => void;
  goTeam: () => void;
  goCollection: () => void;
  toggleRole: () => void;
  setCat: (c: AttrCategory) => void;
  setCTab: (t: CardBackTab) => void;
  flipCard: () => void;
  openLatest: (e?: SyntheticEvent) => void;
  openMoment: (id: string) => void;
  closeMoment: () => void;
  goStage: (n: number) => void;
  nextStage: () => void;
  prevStage: () => void;
  openCollectible: (id: string) => void;
  closeCollectible: () => void;
  tiltMove: (e: ReactMouseEvent<HTMLElement>) => void;
  tiltReset: (e: ReactMouseEvent<HTMLElement>) => void;
  openAdd: () => void;
  closeAdd: () => void;
  pickAddType: (t: string) => void;
  closeFlow: () => void;
  flowNext: () => void;
  flowBack: () => void;
  pickAPlayer: (id: string) => void;
  pickAEvent: (id: string) => void;
  pickAAch: (id: string) => void;
  setDesc: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  setScore: (e: ChangeEvent<HTMLInputElement>) => void;
  submitMoment: () => void;
  unlockViewCollection: () => void;
  unlockCreateStory: () => void;
  unlockReturnHome: () => void;
  pickFiles: () => void;
  onFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  dragOver: (e: DragEvent<HTMLElement>) => void;
  dragLeave: (e: DragEvent<HTMLElement>) => void;
  dropFiles: (e: DragEvent<HTMLElement>) => void;
  removeFile: (id: string) => void;
  openCeleb: (name: string) => void;
  closeCeleb: () => void;
  setCoachMsg: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  pickAward: (a: string) => void;
  sendRecognition: () => void;
  goCoachVerify: () => void;
  goCoachCelebrate: () => void;
};

export type OsAppProps = {
  /** Real Supabase-backed player/team data, fetched server-side. Falls back to demo data when absent (no Supabase project configured, or no linked player yet). */
  initialData?: OsData;
  /** Whether src/app/os/page.tsx found a Supabase session. */
  hasSession?: boolean;
  /** The signed-in user's profiles.role. Null until RoleSelect has run once. */
  profileRole?: 'parent' | 'coach' | null;
  /** Parent: has at least one guardians row (a real player claimed). */
  hasClaimedPlayer?: boolean;
  /** Coach: has at least one coach_team row (a real team created). */
  hasTeam?: boolean;
};

export default function OsApp({
  initialData,
  hasSession = false,
  profileRole = null,
  hasClaimedPlayer = false,
  hasTeam = false,
}: OsAppProps) {
  const [state, setState] = useState<OsState>(() => ({
    ...initialOsState,
    role: profileRole === 'coach' ? 'coach' : 'owner',
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const sentTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const patch = useCallback((partial: Partial<OsState> | ((s: OsState) => Partial<OsState>)) => {
    setState((s) => ({ ...s, ...(typeof partial === 'function' ? partial(s) : partial) }));
  }, []);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
      clearTimeout(sentTimerRef.current);
    };
  }, []);

  // The initial useState above only runs on first mount, which can happen
  // before sign-in (profileRole still null). Later transitions — signing
  // in, creating a team — go through router.refresh() rather than a full
  // remount, so without this the view stays stuck on whatever role was
  // true at that first, pre-auth mount. Re-sync whenever the server-known
  // role changes; the manual toggle below still works for demo preview.
  useEffect(() => {
    if (profileRole) {
      setState((s) => ({ ...s, role: profileRole === 'coach' ? 'coach' : 'owner' }));
    }
  }, [profileRole]);

  const addFiles = useCallback((list: FileList | null) => {
    const incoming = Array.from(list || []);
    const arr = incoming.map((file, i) => {
      const isVideo = (file.type || '').indexOf('video') === 0;
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return {
        id: `${Date.now()}-${i}`,
        name: file.name,
        size: fmtFileSize(file.size),
        isVideo,
        url,
        uploadStatus: 'uploading' as const,
      };
    });
    patch((s) => ({ files: s.files.concat(arr) }));

    // Instant local preview above is the UX; this upload happens in the
    // background so submitMoment() has real S3 keys ready by the time the
    // user actually hits submit.
    const osData = initialData ?? DEMO_OS_DATA;
    const uploadPlayerId = osData.mode === 'demo' ? state.aPlayer : osData.playerId;
    arr.forEach((entry, i) => {
      const form = new FormData();
      form.append('file', incoming[i]);
      if (uploadPlayerId) form.append('playerId', uploadPlayerId);
      fetch('/api/os/moments/upload', { method: 'POST', body: form })
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .then((data: { key: string }) => {
          patch((s) => ({
            files: s.files.map((f) => (f.id === entry.id ? { ...f, uploadStatus: 'done', s3Key: data.key } : f)),
          }));
        })
        .catch(() => {
          patch((s) => ({
            files: s.files.map((f) => (f.id === entry.id ? { ...f, uploadStatus: 'error' } : f)),
          }));
        });
    });
  }, [patch, state.aPlayer, initialData]);

  const closeFlow = useCallback(() => {
    state.files.forEach((f) => { URL.revokeObjectURL(f.url); objectUrlsRef.current.delete(f.url); });
    patch({ addOpen: false, addStep: 0, addType: null, aEvent: null, aAch: null, aDesc: '', aScore: '', addUnlock: false, addSubmitError: false, files: [], dragging: false });
  }, [patch, state.files]);

  const actions: OsActions = {
    activate: () => patch({ activated: true }),
    toggleDark: () => patch((s) => ({ dark: !s.dark })),
    setTab: (t) => patch({ tab: t, moment: null }),
    goTeam: () => patch({ tab: 'team', moment: null }),
    goCollection: () => patch({ tab: 'journey', moment: null }),
    toggleRole: () => patch((s) => ({ role: s.role === 'owner' ? 'coach' : 'owner', tab: 'home', moment: null, celeb: null, award: null })),
    setCat: (c) => patch({ cat: c }),
    setCTab: (t) => patch({ ctab: t }),
    flipCard: () => patch((s) => ({ flipped: !s.flipped })),
    openLatest: (e) => { e?.stopPropagation(); patch({ moment: 'e1', mStage: 1 }); },
    openMoment: (id) => patch({ moment: id as OsState['moment'], mStage: 1 }),
    closeMoment: () => patch({ moment: null, mStage: 1 }),
    goStage: (n) => patch({ mStage: n }),
    nextStage: () => patch((s) => ({ mStage: Math.min(s.mStage + 1, 6) })),
    prevStage: () => patch((s) => ({ mStage: Math.max(s.mStage - 1, 1) })),
    openCollectible: (id) => patch({ collectible: id as OsState['collectible'] }),
    closeCollectible: () => patch({ collectible: null }),
    tiltMove: (e) => {
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transformStyle = 'preserve-3d';
      el.style.transition = 'transform .08s ease';
      el.style.transform = `perspective(800px) rotateY(${(px * 6).toFixed(2)}deg) rotateX(${(-py * 6).toFixed(2)}deg)`;
      el.querySelectorAll<HTMLElement>('[data-tiltz]').forEach((z) => {
        const d = parseFloat(z.getAttribute('data-tiltz') || '') || 24;
        z.style.transition = 'transform .08s ease';
        z.style.transform = `translateZ(${d}px)`;
      });
    },
    tiltReset: (e) => {
      const el = e.currentTarget;
      el.style.transition = 'transform .5s cubic-bezier(.2,.6,.2,1)';
      el.style.transform = 'perspective(800px) rotateY(0) rotateX(0)';
      el.querySelectorAll<HTMLElement>('[data-tiltz]').forEach((z) => {
        z.style.transition = 'transform .5s cubic-bezier(.2,.6,.2,1)';
        z.style.transform = 'translateZ(0)';
      });
    },
    openAdd: () => patch({ addOpen: true }),
    closeAdd: () => {
      state.files.forEach((f) => { URL.revokeObjectURL(f.url); objectUrlsRef.current.delete(f.url); });
      patch({ addOpen: false, files: [], dragging: false });
    },
    pickAddType: (t) => patch({ addOpen: false, addStep: 1, addType: t, addSubmitError: false }),
    closeFlow,
    flowNext: () => patch((s) => {
      if (s.addStep === 2 && !s.aEvent) return {};
      if (s.addStep === 3 && !s.aAch) return {};
      return { addStep: Math.min(s.addStep + 1, 5) };
    }),
    flowBack: () => patch((s) => (s.addStep <= 1 ? { addStep: 0, addOpen: true } : { addStep: s.addStep - 1 })),
    pickAPlayer: (id) => patch({ aPlayer: id }),
    pickAEvent: (id) => patch({ aEvent: id }),
    pickAAch: (id) => patch({ aAch: id }),
    setDesc: (e) => patch({ aDesc: e.target.value }),
    setScore: (e) => patch({ aScore: e.target.value }),
    submitMoment: () => {
      const achLabel = ADD_ACH.find((a) => a.id === state.aAch)?.label ?? state.aDesc ?? 'New Moment';
      const media = state.files
        .filter((f) => f.uploadStatus === 'done' && f.s3Key)
        .map((f) => ({ key: f.s3Key as string, kind: (f.isVideo ? 'video' : 'photo') as 'video' | 'photo' }));
      const osData = initialData ?? DEMO_OS_DATA;
      const isRealSession = osData.mode !== 'demo';
      const playerIdToSubmit = isRealSession ? osData.playerId : state.aPlayer;

      if (isRealSession && !playerIdToSubmit) {
        patch({ addSubmitError: true });
        return;
      }

      const request = fetch('/api/os/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: playerIdToSubmit, title: achLabel, note: state.aDesc, media }),
      });

      if (isRealSession) {
        // Real accounts must see the truth: only celebrate once the moment
        // actually saved, and surface a retryable error instead of the
        // previous fire-and-forget behaviour that swallowed failures and
        // showed the unlock celebration regardless.
        request
          .then((res) => {
            if (!res.ok) throw new Error('submit failed');
            patch({ addStep: 0, addOpen: false, addUnlock: true, addSubmitError: false });
          })
          .catch(() => patch({ addSubmitError: true }));
      } else {
        // Demo: instant celebration regardless, matching the existing UX.
        request.catch(() => {});
        patch({ addStep: 0, addOpen: false, addUnlock: true });
      }
    },
    unlockViewCollection: () => { closeFlow(); patch({ tab: 'journey' }); },
    unlockCreateStory: () => { closeFlow(); patch({ tab: 'journey' }); },
    unlockReturnHome: () => { closeFlow(); patch({ tab: 'home' }); },
    pickFiles: () => fileInputRef.current?.click(),
    onFiles: (e) => { addFiles(e.target.files); e.target.value = ''; },
    dragOver: (e) => { e.preventDefault(); if (!state.dragging) patch({ dragging: true }); },
    dragLeave: (e) => { e.preventDefault(); patch({ dragging: false }); },
    dropFiles: (e) => { e.preventDefault(); patch({ dragging: false }); addFiles(e.dataTransfer.files); },
    removeFile: (id) => patch((s) => {
      const f = s.files.find((x) => x.id === id);
      if (f) { URL.revokeObjectURL(f.url); objectUrlsRef.current.delete(f.url); }
      return { files: s.files.filter((x) => x.id !== id) };
    }),
    openCeleb: (name) => patch({ celeb: name, award: null, coachMsg: '' }),
    closeCeleb: () => patch({ celeb: null, award: null }),
    setCoachMsg: (e) => patch({ coachMsg: e.target.value }),
    pickAward: (a) => patch({ award: a }),
    sendRecognition: () => {
      if (!state.award) return;
      // state.celeb is the player's display name, not a DB id — SQUAD is
      // still demo data (see osData.ts) with no stable player id to send
      // here yet. Once a real coach's squad is wired through, this becomes
      // a real players.id and the celebrate route's RLS check starts doing
      // real work instead of just rejecting the request.
      fetch('/api/os/celebrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: state.celeb, award: state.award, message: state.coachMsg }),
      }).catch(() => {});
      patch({ celeb: null, award: null, coachMsg: '', sent: true });
      clearTimeout(sentTimerRef.current);
      sentTimerRef.current = setTimeout(() => patch({ sent: false }), 2600);
    },
    goCoachVerify: () => patch({ tab: 'verify', moment: null }),
    goCoachCelebrate: () => patch({ tab: 'celebrate', moment: null }),
  };

  const isCoach = state.role === 'coach';
  const isOwner = !isCoach;
  const OR = '#E97435';

  const titles: Record<string, string> = isCoach
    ? { home: 'HOME', team: 'MY TEAM', celebrate: 'CELEBRATE', verify: 'VERIFY', profile: 'PROFILE' }
    : { home: '', journey: 'COLLECTION', card: 'ATTRIBUTES', team: 'TEAMS', profile: 'PROFILE' };

  const tabDefs: [Tab, string, string][] = isCoach
    ? [['home', 'Home', 'home'], ['team', 'Team', 'team'], ['celebrate', 'Celebrate', 'star'], ['verify', 'Verify', 'shield'], ['profile', 'Profile', 'user']]
    : [['home', 'Home', 'home'], ['journey', 'Collection', 'flag'], ['card', 'Card', 'card'], ['profile', 'Profile', 'user']];

  const showFab = isOwner && state.activated && (state.tab === 'home' || state.tab === 'journey') && state.addStep === 0 && !state.addOpen && !state.addUnlock && !state.moment && !state.celeb;
  const showBack = state.tab === 'card';
  const showLogo = state.tab === 'home';

  return (
    <OsDataProvider value={initialData ?? DEMO_OS_DATA}>
    <div className={`emblem-os${state.dark ? ' os-dark' : ''}`}>
      <div style={{ position: 'relative', width: 400, maxWidth: '100%', height: 848, background: '#0B0B0B', borderRadius: 52, padding: 11, boxShadow: '0 50px 100px -30px rgba(0,0,0,.55)' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--os-screen)', borderRadius: 42, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'background .35s ease' }}>

          {!state.activated && (
            <ActivationGate
              onActivate={actions.activate}
              hasSession={hasSession}
              profileRole={profileRole}
              hasClaimedPlayer={hasClaimedPlayer}
              hasTeam={hasTeam}
            />
          )}

          {/* status bar */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 30px 6px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 15, color: 'var(--os-ink)' }}>
            <span>9:41</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="17" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1" /><rect x="5" y="4" width="3" height="8" rx="1" /><rect x="10" y="1.5" width="3" height="10.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M1 4.5a10 10 0 0 1 14 0M3.5 7a6.5 6.5 0 0 1 9 0M8 9.6h.01" /></svg>
              <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="16" height="8" rx="1.5" /><rect x="21.5" y="4" width="2" height="4" rx="1" /></svg>
            </div>
          </div>

          {/* top bar */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 12px' }}>
            {showBack ? (
              <div onClick={() => actions.setTab('home')} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </div>
            ) : <div style={{ width: 34 }} />}
            {showLogo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {!state.dark
                  ? <img src={`${osAssetPath}/emblem-wordmark.png`} alt="Emblem" style={{ height: 33, width: 'auto', objectFit: 'contain' }} />
                  : <img src={`${osAssetPath}/emblem-logo-light.png`} alt="Emblem" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />}
              </div>
            ) : (
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, letterSpacing: '.14em', fontSize: 15, color: 'var(--os-ink)' }}>{titles[state.tab] || ''}</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--os-ink)' }}>
              <div onClick={actions.toggleDark} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 21, height: 21 }}>
                {state.dark
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
              </div>
              <div style={{ position: 'relative' }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                <span style={{ position: 'absolute', top: -1, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#E97435', border: '1.5px solid var(--os-screen)' }} />
              </div>
              <div onClick={actions.toggleRole} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', background: isCoach ? 'rgba(21,19,15,.06)' : 'rgba(233,116,53,.1)', border: `1px solid ${isCoach ? 'rgba(21,19,15,.14)' : 'rgba(233,116,53,.3)'}`, borderRadius: 20, padding: '4px 10px 4px 5px' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: isCoach ? 'linear-gradient(150deg,#3a3a3a,#111)' : 'linear-gradient(150deg,#E9C46A,#C98B3A)', border: '1.5px solid #fff', boxShadow: '0 2px 6px -1px rgba(0,0,0,.25)', flex: '0 0 auto' }} />
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 10.5, color: isCoach ? '#15130F' : '#C4501C', textTransform: 'uppercase' }}>{isCoach ? 'Coach' : 'Owner'}</span>
              </div>
            </div>
          </div>

          {/* scroll area */}
          <div id="os-scroll" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '4px 18px 96px' }}>
            {isCoach ? (
              <>
                {state.tab === 'home' && <CoachHome actions={actions} />}
                {state.tab === 'team' && <CoachTeam actions={actions} />}
                {state.tab === 'celebrate' && <CoachCelebrate actions={actions} />}
                {state.tab === 'verify' && <CoachVerify />}
                {state.tab === 'profile' && <CoachProfile />}
              </>
            ) : (
              <>
                {state.tab === 'home' && <PlayerHome actions={actions} />}
                {state.tab === 'journey' && ((initialData ?? DEMO_OS_DATA).mode === 'demo' ? <Journey actions={actions} /> : <RealJourney />)}
                {state.tab === 'card' && <CardScreen state={state} actions={actions} />}
                {state.tab === 'team' && <Team actions={actions} />}
                {state.tab === 'profile' && <Profile actions={actions} />}
              </>
            )}
          </div>

          {state.moment && <MomentStage state={state} actions={actions} />}
          {state.collectible && <CollectibleViewer state={state} actions={actions} />}

          <AddMomentFlow state={state} actions={actions} fileInputRef={fileInputRef} />

          {state.celeb && <CelebrateSheet state={state} actions={actions} />}

          {state.sent && (
            <div style={{ position: 'absolute', left: '50%', bottom: 92, transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 9, background: '#15130F', color: '#fff', borderRadius: 14, padding: '12px 18px', boxShadow: '0 14px 30px -12px rgba(0,0,0,.5)', animation: 'faceIn .3s ease', whiteSpace: 'nowrap' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FD07E" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5 }}>Recognition added to their journey</span>
            </div>
          )}

          {showFab && (
            <div onClick={actions.openAdd} role="button" aria-label="Add Moment" tabIndex={0} style={{ position: 'absolute', left: '50%', bottom: 80, transform: 'translateX(-50%)', zIndex: 44, width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(150deg,#E97435,#C4501C)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 16px 34px -10px rgba(233,116,53,.75),0 4px 10px -4px rgba(0,0,0,.4)' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(233,116,53,.5)', animation: 'actRing 2.4s ease-out infinite' }} />
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </div>
          )}

          {/* bottom tab bar */}
          <div role="navigation" aria-label="Primary" style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 14px calc(8px + env(safe-area-inset-bottom))', background: 'var(--os-card)', borderTop: '1px solid var(--os-border)', boxShadow: '0 -6px 20px -14px rgba(0,0,0,.2)' }}>
            {tabDefs.map(([key, label, ic]) => {
              const on = state.tab === key;
              const c = on ? OR : '#8A8378';
              return (
                <div key={key} onClick={() => actions.setTab(key)} role="button" aria-label={label} aria-current={on ? 'page' : undefined} tabIndex={0} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 1, minHeight: 44, justifyContent: 'center' }}>
                  <span style={{ position: 'absolute', top: -10, width: 22, height: 3, borderRadius: 3, background: on ? OR : 'transparent' }} />
                  {ICN[ic](c)}
                  <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 11, color: c }}>{label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 128, height: 5, borderRadius: 4, background: '#15130F' }} />

        </div>
      </div>
    </div>
    </OsDataProvider>
  );
}
