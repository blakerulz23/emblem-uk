'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ADD_ACH, MOMENT_ORDER, fmtFileSize, osAssetPath } from './data';
import { onActivateKey } from './a11y';
import { initialOsState } from './types';
import type { OsState, Tab } from './types';
import { OsDataProvider, DEMO_OS_DATA } from './OsDataContext';
import type { OsData } from './OsDataContext';
import type { StoryUpdate } from './osData';
import { useStoryUpdates } from './useStoryUpdates';
import OSBottomNavigation from './navigation/OSBottomNavigation';
import { PLAYER_NAV_ITEMS, COACH_NAV_ITEMS } from './navigation/navItems';
import type { UseOsRefreshResult } from './useOsRefresh';
import OsRefreshBridge from './OsRefreshBridge';
import OsRefreshIndicator from './OsRefreshIndicator';

/** Every tab key either role can be in, player or coach — used to validate
 * a ?screen= value read from the URL (see resolveTabFromSearchParams)
 * before trusting it, since it's user-editable/bookmarkable input. */
const VALID_TABS = new Set<Tab>(['home', 'journey', 'card', 'team', 'profile', 'celebrate', 'verify']);

function resolveTabFromSearchParams(searchParams: { get(key: string): string | null } | null): Tab | null {
  const raw = searchParams?.get('screen');
  return raw && VALID_TABS.has(raw as Tab) ? (raw as Tab) : null;
}

import ActivationGate from './overlays/ActivationGate';
import MomentStage from './overlays/MomentStage';
import CollectibleViewer from './overlays/CollectibleViewer';
import AddMomentFlow from './overlays/AddMomentFlow';
import CelebrateSheet from './overlays/CelebrateSheet';
import StoryUpdates from './overlays/StoryUpdates';

import PlayerHome from './screens/PlayerHome';
import DemoCollection from './screens/DemoCollection';
import RealCollection from './screens/RealCollection';
import CardScreen from './screens/Card';
import Profile from './screens/Profile';
import CoachHome from './screens/CoachHome';
import CoachTeam from './screens/CoachTeam';
import CoachPlayerDetail from './screens/CoachPlayerDetail';
import CoachCelebrate from './screens/CoachCelebrate';
import CoachVerify from './screens/CoachVerify';
import CoachProfile from './screens/CoachProfile';

export type OsActions = {
  activate: () => void;
  toggleDark: () => void;
  setTab: (t: Tab) => void;
  goCollection: () => void;
  goCard: () => void;
  toggleRole: () => void;
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
  openCoachPlayer: (id: string) => void;
  closeCoachPlayer: () => void;
  openStoryUpdates: () => void;
  closeStoryUpdates: () => void;
  clearHighlightMoment: () => void;
  openStoryUpdate: (update: StoryUpdate) => void;
  openLatestMoment: (momentId: string) => void;
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
  /** True only when src/app/os/page.tsx has already resolved a ?card=
   * claim_token server-side and confirmed the current session is that
   * player's guardian — tells ActivationGate not to re-run its own
   * ?card= resolution for the same code (it would otherwise redirect to
   * the public profile a moment later, undoing the server's decision).
   * Never set for any other outcome (anonymous, unrelated, coach) —
   * those still go through the normal server redirect. */
  cardAlreadyResolved?: boolean;
};

export default function OsApp({
  initialData,
  hasSession = false,
  profileRole = null,
  hasClaimedPlayer = false,
  hasTeam = false,
  cardAlreadyResolved = false,
}: OsAppProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A coach landing here right after redeeming a direct-connection invite
  // (ActivationGate's AuthenticatedCoachInviteResolve / post-auth resolve
  // effect) arrives as /os?openPlayer=<id> — jump straight to that
  // player's Coach Player Detail rather than leaving the coach to hunt
  // for them under Individual Players. Read fresh on every render (not
  // baked into the initial useState below) deliberately: the invite flow
  // resolves via router.push, a *soft* client-side navigation, and OsApp
  // is already mounted as ActivationGate's parent by that point — a
  // one-time useState initializer would never re-run just because new
  // props/search params arrived, only a genuine remount. A useEffect
  // below (after `patch` exists) reacts to this value however it
  // changes, mount or not — same reasoning as the existing profileRole
  // resync effect further down.
  const openPlayerId = searchParams?.get('openPlayer')?.trim() || null;
  // Seeds the active tab from ?screen= on first mount only (a direct
  // navigation or a refresh) — kept in sync afterwards by the tabUrlSync
  // effect below, and by the popstate listener for browser back/forward.
  // Falls back to initialOsState.tab ('home') for an absent/invalid value,
  // same as before this existed.
  const [state, setState] = useState<OsState>(() => ({
    ...initialOsState,
    role: profileRole === 'coach' ? 'coach' : 'owner',
    tab: resolveTabFromSearchParams(searchParams) ?? initialOsState.tab,
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const sentTimerRef = useRef<ReturnType<typeof setTimeout>>();
  /** False until the ?screen= URL-sync effect has run once — see that effect further down. */
  const tabSyncedOnceRef = useRef(false);
  /** The actual #os-scroll DOM node — pull-to-refresh (useOsRefresh) attaches its touch listeners directly to this, not to a synthetic React handler. */
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Reacts to ?openPlayer= however it arrives — a genuinely fresh mount
  // (e.g. AuthenticatedCoachInviteResolve's window.location-style hard
  // navigation isn't used here; router.push is) or a soft navigation onto
  // an already-mounted OsApp. router.replace('/os') strips the param
  // once consumed — cosmetic only (this effect itself won't re-fire from
  // its own cleanup, since openPlayerId becomes null right after), but
  // otherwise a refreshed/shared/bookmarked URL would carry a
  // now-meaningless player id forever.
  useEffect(() => {
    if (profileRole === 'coach' && openPlayerId) {
      patch({ tab: 'team', coachPlayerId: openPlayerId });
      router.replace('/os');
    }
  }, [profileRole, openPlayerId, patch, router]);

  // Browser Back/Forward changes the URL without React ever calling
  // setTab — this is what makes the active tab survive Back/Forward
  // instead of only reacting to clicks. Ignores an unrecognised/absent
  // ?screen= (e.g. Back past the very first sync) rather than guessing.
  // (The URL->state.tab sync effect itself lives further down, after
  // osData/isCoach are computed — see the "?screen= sync" comment there.)
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = resolveTabFromSearchParams(params);
      if (tab) patch({ tab, moment: null, coachPlayerId: null, highlightMomentId: null });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [patch]);

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

  // Moved above `actions` (was further down, right before render) so
  // openStoryUpdate below can close over it. Story Updates are kept live by
  // their own dedicated subscription (filtered to this viewer), entirely
  // separate from OsDataContext's refreshOsData() — an update landing here
  // never needs the rest of OsData to also refresh.
  const osData = initialData ?? DEMO_OS_DATA;
  // Seeded from osData (the initialData prop) like before, but kept live
  // afterwards by OsRefreshBridge's onStoryUpdatesChange — osData itself
  // never changes except on a genuine new navigation (it's a plain prop),
  // so without this a successful pull-to-refresh/manual refresh would
  // update every other OsData field (via useOsData() in PlayerHome/
  // CoachHome directly) while "What's New"/Coach Assessment kept showing
  // pre-refresh content (confirmed empirically during this feature's own
  // testing — see OsRefreshBridge.tsx's doc comment for the full story).
  const [liveStoryUpdatesSeed, setLiveStoryUpdatesSeed] = useState({
    storyUpdates: osData.storyUpdates,
    unreadCount: osData.unreadStoryUpdateCount,
  });
  // A genuine new navigation (a fresh initialData prop) must win over
  // whatever a prior pull-to-refresh had reported — re-seeds from the new
  // snapshot rather than leaving the previous player's/session's story
  // updates in place.
  useEffect(() => {
    setLiveStoryUpdatesSeed({ storyUpdates: osData.storyUpdates, unreadCount: osData.unreadStoryUpdateCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);
  const handleStoryUpdatesChange = useCallback((updates: StoryUpdate[], unreadCount: number) => {
    setLiveStoryUpdatesSeed({ storyUpdates: updates, unreadCount });
  }, []);
  const { storyUpdates, unreadCount: unreadStoryUpdateCount, markRead: markStoryUpdateRead } = useStoryUpdates(
    liveStoryUpdatesSeed.storyUpdates,
    liveStoryUpdatesSeed.unreadCount,
    osData.viewerId
  );

  const actions: OsActions = {
    activate: () => patch({ activated: true }),
    toggleDark: () => patch((s) => ({ dark: !s.dark })),
    setTab: (t) => patch({ tab: t, moment: null, coachPlayerId: null, highlightMomentId: null }),
    goCollection: () => patch({ tab: 'journey', moment: null, highlightMomentId: null }),
    goCard: () => patch({ tab: 'card', moment: null, highlightMomentId: null }),
    toggleRole: () => patch((s) => ({ role: s.role === 'owner' ? 'coach' : 'owner', tab: 'home', moment: null, celeb: null, award: null })),
    flipCard: () => patch((s) => ({ flipped: !s.flipped })),
    // The chronologically most recent demo moment — never hardcoded to
    // 'e1', so this stays correct if the demo dataset's order ever changes.
    openLatest: (e) => { e?.stopPropagation(); patch({ moment: MOMENT_ORDER[MOMENT_ORDER.length - 1] as OsState['moment'], mStage: 1 }); },
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
      // Guards against a double-tap firing a second POST before the first
      // one settles, which would otherwise create two moment rows for the
      // same event — there was no such guard before this.
      if (state.addSubmitting) return;

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

      patch({ addSubmitting: true, addSubmitError: false });

      const request = fetch('/api/os/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: playerIdToSubmit, title: achLabel, note: state.aDesc, media }),
      });

      if (isRealSession) {
        // Real accounts must see the truth: only celebrate once the moment
        // actually saved, and surface a retryable error instead of the
        // previous fire-and-forget behaviour that swallowed failures and
        // showed the unlock celebration regardless. The success screen's
        // copy reads the server's actual assigned status, never assumes it
        // client-side. router.refresh() so the newly-submitted moment is
        // actually there once the guardian views the Collection, not just
        // the celebration overlay.
        request
          .then(async (res) => {
            if (!res.ok) throw new Error('submit failed');
            const data = (await res.json().catch(() => ({}))) as { status?: 'family_memory' | 'pending_verification' };
            patch({ addStep: 0, addOpen: false, addUnlock: true, addSubmitError: false, addSubmitting: false, addResultStatus: data.status ?? null });
            router.refresh();
          })
          .catch(() => patch({ addSubmitError: true, addSubmitting: false }));
      } else {
        // Demo: instant celebration regardless, matching the existing UX.
        request.catch(() => {});
        patch({ addStep: 0, addOpen: false, addUnlock: true, addSubmitting: false });
      }
    },
    unlockViewCollection: () => { closeFlow(); patch({ tab: 'journey' }); },
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
    goCoachVerify: () => patch({ tab: 'verify', moment: null, coachPlayerId: null, highlightMomentId: null }),
    goCoachCelebrate: () => patch({ tab: 'celebrate', moment: null, coachPlayerId: null, highlightMomentId: null }),
    openCoachPlayer: (id) => patch({ coachPlayerId: id, highlightMomentId: null }),
    closeCoachPlayer: () => patch({ coachPlayerId: null }),
    openStoryUpdates: () => patch({ storyUpdatesOpen: true }),
    closeStoryUpdates: () => patch({ storyUpdatesOpen: false }),
    clearHighlightMoment: () => patch({ highlightMomentId: null }),
    // Deep-links per the roadmap's Locked Decision 4/8 routing table.
    // season_focus_added is the only event type genuinely received by
    // either role (coach-authored -> guardian recipient; guardian-authored
    // -> coach recipient) — every other event type has one fixed recipient
    // role, so no role check is needed for those.
    openStoryUpdate: (update) => {
      const isCoachViewer = state.role === 'coach';
      switch (update.eventType) {
        case 'assessment_shared':
          patch({ tab: 'card', flipped: true, moment: null, coachPlayerId: null, highlightMomentId: null, storyUpdatesOpen: false });
          break;
        case 'season_focus_added':
          if (isCoachViewer) {
            patch({ tab: 'team', coachPlayerId: update.playerId, moment: null, highlightMomentId: null, storyUpdatesOpen: false });
          } else {
            patch({ tab: 'card', flipped: true, moment: null, coachPlayerId: null, highlightMomentId: null, storyUpdatesOpen: false });
          }
          break;
        case 'recognition':
        case 'moment_verified':
          patch({ tab: 'journey', moment: null, coachPlayerId: null, highlightMomentId: update.relatedMomentId, storyUpdatesOpen: false });
          break;
        case 'verification_required':
          patch({ tab: 'verify', moment: null, coachPlayerId: null, highlightMomentId: null, storyUpdatesOpen: false });
          break;
        case 'moment_uploaded':
        case 'guardian_connected':
          patch({ tab: 'team', coachPlayerId: update.playerId, moment: null, highlightMomentId: null, storyUpdatesOpen: false });
          break;
        case 'coach_connected':
        case 'coach_removed':
          // Guardians have no working 'team' screen (only coaches do) —
          // the natural guardian-side home for a coach connecting or
          // disconnecting is Profile's own Connections section.
          // router.refresh() (OsApp's own top-level resync mechanism,
          // same one used elsewhere in this file — child screens use the
          // context-based refreshOsData() instead, since they sit below
          // OsDataProvider and OsApp doesn't) re-fetches Connections
          // before landing there, so a guardian who was viewing a stale
          // Connections list before opening this update sees the
          // current state immediately, not what was true when the page
          // first loaded. The Story Update itself already arrived live
          // via the existing story_updates realtime subscription — this
          // is only about the destination screen's own data being fresh
          // once tapped, not a new subscription.
          router.refresh();
          patch({ tab: 'profile', moment: null, coachPlayerId: null, highlightMomentId: null, storyUpdatesOpen: false });
          break;
      }
      markStoryUpdateRead(update.id);
    },
    // Home's Latest Moment card deep-links straight into Collection with
    // the same scroll+highlight mechanism as a Story Update's
    // recognition/moment_verified branch above — reused, not reinvented.
    openLatestMoment: (momentId) => patch({ tab: 'journey', moment: null, coachPlayerId: null, highlightMomentId: momentId, storyUpdatesOpen: false }),
  };

  const isCoach = state.role === 'coach';
  const isOwner = !isCoach;
  const isDemo = osData.mode === 'demo';

  // Guardian-context control: which claimed child's data every one of the
  // four owner destinations is currently showing. Global chrome, not owned
  // by any single destination — moved here from Card.tsx (Milestone 5;
  // flagged during Milestone 2C's review as affecting Home/Collection/
  // Card/Profile together, not a Card-specific concern). Only ever
  // non-empty for an authenticated guardian with 2+ claimed children.
  const showChildSwitcher = isOwner && osData.claimedPlayers.length > 1;

  // Card is its own permanent nav destination (Collection OS Product
  // Specification v1.0 — Home / Collection / Card / Profile, frozen).
  // Restored here in Milestone 2A; Card's own back-face content is
  // unchanged this milestone (that's 2C's job) — this flip-chrome logic
  // just now keys off the 'card' tab instead of 'home'.
  const showOwnerCardBack = isOwner && state.tab === 'card' && state.flipped;

  // A drill-in within the existing 'team' tab (not a 6th coach nav tab),
  // reusing Card's flip-chrome (back-chevron + centered title) rather than
  // introducing a second overlay mechanism.
  const showCoachPlayerDetail = isCoach && state.tab === 'team' && !!state.coachPlayerId;

  const titles: Record<string, string> = isCoach
    ? { home: 'HOME', team: 'MY TEAM', celebrate: 'CELEBRATE', verify: 'VERIFY', profile: 'PROFILE' }
    : { home: '', card: 'CARD', journey: 'COLLECTION', profile: 'PROFILE' };

  const navItems = isCoach ? COACH_NAV_ITEMS : PLAYER_NAV_ITEMS;

  const showFab = isOwner && state.activated && (state.tab === 'home' || state.tab === 'journey') && state.addStep === 0 && !state.addOpen && !state.addUnlock && !state.moment && !state.celeb;
  const showBack = showOwnerCardBack || showCoachPlayerDetail;
  const showLogo = state.tab === 'home';
  const currentTitle = showOwnerCardBack ? 'ABOUT' : showCoachPlayerDetail ? 'PLAYER' : (titles[state.tab] || '');

  // True while any full-screen overlay/bottom-sheet that needs
  // uninterrupted focus is open — the fixed nav/Add button hide (not just
  // sit visually beneath, see OSBottomNavigation's z-index comment) so a
  // keyboard/AT user tabbing through the page can't reach them, and so no
  // tap can land on the nav through an overlay. AddMomentFlow is always
  // mounted and gates its own steps internally, so its "open" state here is
  // the same three fields showFab already reads to know it should hide.
  const anyOverlayOpen =
    !state.activated || !!state.moment || !!state.collectible || !!state.celeb ||
    state.storyUpdatesOpen || state.addOpen || state.addStep > 0 || state.addUnlock;
  /** anyOverlayOpen minus ActivationGate (which gets its own `position:
   * fixed` wrapper further up, since it renders before the top bar) — used
   * to guard the *other* five overlays' shared wrapper below so that
   * wrapper is never mounted empty. An always-mounted `position: fixed;
   * inset: 0` div — even with no visible content — still intercepts every
   * tap across the whole app (a transparent box still hit-tests), so it
   * must not exist in the DOM at all when nothing inside it is showing. */
  const anyContentOverlayOpen = anyOverlayOpen && state.activated;

  // Pull-to-refresh is disabled whenever anyOverlayOpen is true (covers
  // AddMomentFlow/MomentStage/CollectibleViewer/CelebrateSheet/
  // StoryUpdates/the auth gate — every one of these holds real draft text
  // in OsApp's own `state`, e.g. AddMomentFlow's description/score,
  // CelebrateSheet's message, which a data refresh can't touch anyway
  // since it only ever replaces OsDataContext — but a refresh spinner
  // interrupting someone mid-type is still the wrong feel) — plus in demo
  // mode, where there's no real session for /api/os/refresh to refresh
  // (it would just 401 on every pull). useOsRefresh's own touch handler
  // additionally refuses to start tracking a gesture at all if the
  // currently focused element is a text input/textarea/select/
  // contenteditable anywhere on screen — the generic safety net for
  // screen-local draft state this flag doesn't know about (e.g.
  // CoachTeam.tsx's own add-player/invite form fields, which live in that
  // component's own useState, never in OsApp's central state or
  // OsDataContext either).
  // See OsRefreshBridge.tsx for why this is a callback-fed useState rather
  // than a direct useOsRefresh() call here: useOsRefresh needs to run
  // inside <OsDataProvider>, not in the component (this one) that renders
  // it.
  const [osRefresh, setOsRefresh] = useState<UseOsRefreshResult>({
    status: 'idle', pullDistance: 0, progress: 0, announcement: '', triggerManualRefresh: () => {},
  });
  const osRefreshDisabled = anyOverlayOpen || isDemo;

  // Keeps ?screen=<tab> in sync with state.tab for EVERY tab change,
  // however it happens — a bottom-nav tap, "See every chapter in
  // Collection", opening a Story Update, etc. — not just the nav bar's own
  // onSelect, so "the active tab is derived from route/screen state" holds
  // everywhere, not only at one entry point. Uses the native History API
  // directly (not router.push/replace) so a tab switch stays instant — no
  // Next.js server round-trip/data refetch on every tap, matching how this
  // already behaved before ?screen= existed. The very first sync (on
  // mount) uses replaceState so establishing the initial URL doesn't leave
  // a spurious extra stop in the back-button history; every real tab
  // change after that uses pushState, so Back/Forward can step through
  // tabs. Only ever sets `screen` (and, for a guardian with no explicit
  // ?player= yet, fills that gap) — every other existing param, `player`
  // included, is read from the current URL untouched, so a tab switch can
  // never drop or swap the selected player.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const alreadySynced = params.get('screen') === state.tab;
    if (!alreadySynced) params.set('screen', state.tab);
    let playerAdded = false;
    if (!isCoach && osData.playerId && !params.get('player')) {
      params.set('player', osData.playerId);
      playerAdded = true;
    }
    if (alreadySynced && !playerAdded) return;
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    if (tabSyncedOnceRef.current) {
      window.history.pushState(null, '', newUrl);
    } else {
      window.history.replaceState(null, '', newUrl);
    }
    tabSyncedOnceRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tab, isCoach, osData.playerId]);

  // Scopes overscroll-behavior-y: contain (os.css) to the real document
  // only while Emblem OS is mounted — the page now scrolls for real (see
  // .emblem-os-shell in os.css), so this has to live on body, not on an
  // inner div; a class toggled here keeps it from ever touching marketing/
  // staff/builder pages, which don't import os.css at all.
  useEffect(() => {
    // Both html and body: document.documentElement (html) is what
    // scrollWidth/clientWidth checks for horizontal overflow actually
    // read, and what iOS Safari's own gesture/rubber-band physics apply
    // to — body alone isn't guaranteed to be the element that matters for
    // either.
    document.documentElement.classList.add('emblem-os-active');
    document.body.classList.add('emblem-os-active');
    return () => {
      document.documentElement.classList.remove('emblem-os-active');
      document.body.classList.remove('emblem-os-active');
    };
  }, []);

  return (
    <OsDataProvider value={initialData ?? DEMO_OS_DATA}>
    <OsRefreshBridge scrollRef={scrollRef} disabled={osRefreshDisabled} onChange={setOsRefresh} onStoryUpdatesChange={handleStoryUpdatesChange} />
    <div className={`emblem-os${state.dark ? ' os-dark' : ''}`}>
      <div className="emblem-os-shell">

          {/* ActivationGate (and everything it renders internally — SignIn,
              RoleFork, ClaimCodeEntry, etc.) still styles its own root as
              `position: absolute; inset: 0`, assuming its containing block
              is exactly one viewport. Now that .emblem-os-shell can grow
              taller than one viewport (see os.css), that assumption only
              holds if the containing block is this new `position: fixed`
              wrapper instead of the shell itself — the wrapper is the only
              thing that changed; ActivationGate's own file is untouched. */}
          {!state.activated && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
              <ActivationGate
                onActivate={actions.activate}
                hasSession={hasSession}
                profileRole={profileRole}
                hasClaimedPlayer={hasClaimedPlayer}
                hasTeam={hasTeam}
                cardAlreadyResolved={cardAlreadyResolved}
              />
            </div>
          )}

          {/* top bar */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
            {showBack ? (
              <div onClick={showCoachPlayerDetail ? actions.closeCoachPlayer : actions.flipCard} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, letterSpacing: '.14em', fontSize: 15, color: 'var(--os-ink)' }}>{currentTitle}</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--os-ink)' }}>
              <div onClick={actions.toggleDark} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 21, height: 21 }}>
                {state.dark
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
              </div>
              {/* Accessible equivalent of the pull-to-refresh gesture —
                  same useOsRefresh status machine and refresh() call, no
                  touch simulation needed. Hidden in demo mode alongside
                  the gesture itself: there's no real session for
                  /api/os/refresh to refresh, so it would just fail on
                  every tap. */}
              {!isDemo && (
                <button
                  type="button"
                  onClick={osRefresh.triggerManualRefresh}
                  disabled={osRefresh.status === 'refreshing' || anyOverlayOpen}
                  aria-label="Refresh updates"
                  style={{
                    cursor: osRefresh.status === 'refreshing' ? 'wait' : anyOverlayOpen ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 21, height: 21, border: 'none', background: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit',
                    opacity: anyOverlayOpen ? 0.4 : 1,
                  }}
                >
                  {osRefresh.status === 'success' ? (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={osRefresh.status === 'refreshing' ? 'os-refresh-spin' : undefined}>
                      <path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" />
                      <path d="M17 4v4.5h-4.5M7 20v-4.5h4.5" />
                    </svg>
                  )}
                </button>
              )}
              <div
                onClick={actions.openStoryUpdates}
                role="button"
                tabIndex={0}
                aria-label={unreadStoryUpdateCount > 0 ? `Story Updates, ${unreadStoryUpdateCount} unread` : 'Story Updates'}
                onKeyDown={onActivateKey(actions.openStoryUpdates)}
                style={{ position: 'relative', cursor: 'pointer' }}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                {unreadStoryUpdateCount > 0 && (
                  <span style={{ position: 'absolute', top: -1, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#E97435', border: '1.5px solid var(--os-screen)' }} />
                )}
              </div>
              {/* Demo-preview only — a real, authenticated session's nav is
                  determined entirely by the server-known profileRole; this
                  manual toggle exists so a signed-out visitor can preview
                  both experiences, never for a real account to peek at the
                  other role's (empty) shell. */}
              {isDemo && (
                <div onClick={actions.toggleRole} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', background: isCoach ? 'rgba(21,19,15,.06)' : 'rgba(233,116,53,.1)', border: `1px solid ${isCoach ? 'rgba(21,19,15,.14)' : 'rgba(233,116,53,.3)'}`, borderRadius: 20, padding: '4px 10px 4px 5px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: isCoach ? 'linear-gradient(150deg,#3a3a3a,#111)' : 'linear-gradient(150deg,#E9C46A,#C98B3A)', border: '1.5px solid #fff', boxShadow: '0 2px 6px -1px rgba(0,0,0,.25)', flex: '0 0 auto' }} />
                  <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 10.5, color: isCoach ? '#15130F' : '#C4501C', textTransform: 'uppercase' }}>{isCoach ? 'Coach' : 'Owner'}</span>
                </div>
              )}
            </div>
          </div>

          {showChildSwitcher && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 10px' }}>
              <select
                value={osData.playerId ?? ''}
                onChange={(e) => router.push(`/os?player=${e.target.value}&screen=${state.tab}`)}
                aria-label="Switch child"
                style={{
                  fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 12, letterSpacing: '.04em',
                  color: 'var(--os-ink)', background: 'var(--os-card)', border: '1px solid var(--os-border)',
                  borderRadius: 999, padding: '6px 14px', cursor: 'pointer',
                }}
              >
                {osData.claimedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* scroll area — the outer div absorbs the flex:1 1 auto sizing
              and gives OsRefreshIndicator a position:relative parent that
              starts exactly where the scroll content starts (not the whole
              phone column, which would sit the indicator behind the header);
              overflow:hidden keeps the indicator's reveal clipped to this
              box rather than poking up over the top bar while idle.
              minHeight:'min-content' is load-bearing, not decorative: a
              flex item whose own overflow isn't `visible` gets an
              *automatic* minimum size of 0 per the flexbox spec, which
              would let this box collapse to whatever flex-grow hands it and
              silently clip (rather than grow for) tall screens — exactly
              the "inner div absorbs the scroll instead of the real
              document" bug this whole change exists to avoid. The explicit
              min-content override restores "grow to fit content" while
              keeping overflow:hidden's clipping for the indicator. */}
          <div style={{ flex: '1 1 auto', minHeight: 'min-content', position: 'relative', overflow: 'hidden' }}>
            <OsRefreshIndicator status={osRefresh.status} pullDistance={osRefresh.pullDistance} progress={osRefresh.progress} onRetry={osRefresh.triggerManualRefresh} />
            <div
              id="os-scroll"
              ref={scrollRef}
              style={{
                // Deliberately no overflow-x/overflow-y/height at all: this
                // div no longer scrolls itself (the real document does —
                // see .emblem-os-shell in os.css) and setting *either*
                // overflow axis alone (even just overflow-x:hidden) makes
                // the browser auto-promote the other axis to `auto` per the
                // CSS Overflow spec ("if one axis is non-visible, used
                // value of the other becomes auto, never visible") —
                // silently recreating an internal scroll container here,
                // confirmed happening during this fix's own testing. The
                // parent wrapper's own overflow:hidden above already clips
                // any accidental horizontal overflow, so this needs none.
                // Pull-to-refresh's own "content follows the finger" — see
                // useOsRefresh.ts. No transition while actively pulling
                // (pulling/ready must track the touch 1:1, any transition
                // lag would read as wrong), only animates the snap-back to
                // 0 or the settle-to-resting-height, both of which happen
                // with no active touch on screen.
                transform: osRefresh.pullDistance > 0 ? `translateY(${osRefresh.pullDistance}px)` : undefined,
                transition: osRefresh.status === 'pulling' || osRefresh.status === 'ready' ? 'none' : 'transform .28s ease',
                // Bottom padding must clear the floating dock — its own
                // height plus the margin now sitting between it and the
                // safe-area inset (the dock no longer sits flush at
                // bottom:0, see --os-dock-margin-bottom) — plus breathing
                // room, and, on the two tabs where the Add button floats
                // above the dock, its own footprint too, whichever of the
                // two requires more room. Not a guessed one-screen spacer —
                // every term here is a real, named quantity.
                padding: `4px 18px ${
                  showFab
                    ? 'max(calc(var(--os-dock-margin-bottom) + var(--os-bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 20px), 156px)'
                    : 'calc(var(--os-dock-margin-bottom) + var(--os-bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 20px)'
                }`,
              }}
            >
              {isCoach ? (
                <>
                  {state.tab === 'home' && <CoachHome actions={actions} storyUpdates={storyUpdates} />}
                  {state.tab === 'team' && (
                    showCoachPlayerDetail
                      ? <CoachPlayerDetail playerId={state.coachPlayerId as string} actions={actions} />
                      : <CoachTeam actions={actions} />
                  )}
                  {state.tab === 'celebrate' && <CoachCelebrate actions={actions} />}
                  {state.tab === 'verify' && <CoachVerify />}
                  {state.tab === 'profile' && <CoachProfile />}
                </>
              ) : (
                <>
                  {state.tab === 'home' && <PlayerHome actions={actions} storyUpdates={storyUpdates} />}
                  {state.tab === 'card' && <CardScreen state={state} actions={actions} />}
                  {state.tab === 'journey' && (isDemo ? <DemoCollection actions={actions} /> : <RealCollection highlightMomentId={state.highlightMomentId} onHighlightDone={actions.clearHighlightMoment} />)}
                  {state.tab === 'profile' && <Profile actions={actions} />}
                </>
              )}
            </div>
          </div>
          <span className="sr-only" aria-live="polite">{osRefresh.announcement}</span>

          {/* Same reasoning as the ActivationGate wrapper above: these five
              overlays' own files are untouched, still `position: absolute;
              inset: 0` internally — this new `position: fixed` wrapper is
              what gives them a viewport-anchored containing block again,
              now that .emblem-os-shell can be taller than one viewport.
              Guarded by anyContentOverlayOpen (not just always-rendered) so
              an empty fixed box never sits over the page intercepting taps
              when none of the five are actually open. */}
          {anyContentOverlayOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
              {state.moment && <MomentStage state={state} actions={actions} />}
              {state.collectible && <CollectibleViewer state={state} actions={actions} />}

              <AddMomentFlow state={state} actions={actions} fileInputRef={fileInputRef} />

              {state.celeb && <CelebrateSheet state={state} actions={actions} />}

              {state.storyUpdatesOpen && (
                <StoryUpdates updates={storyUpdates} onOpen={actions.openStoryUpdate} onClose={actions.closeStoryUpdates} />
              )}
            </div>
          )}

          {state.sent && (
            // Fixed, not absolute: .emblem-os-shell (its old containing
            // block) can now be taller than one viewport on long pages, and
            // this toast must stay glued just above the dock in the
            // visible viewport regardless of scroll position — same reason
            // as the two overlay wrappers above. bottom reuses the dock's
            // own real geometry instead of the old guessed 92px, so it
            // never drifts if the dock's own height/margin ever changes.
            <div style={{ position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--os-dock-margin-bottom) + var(--os-bottom-nav-height) + 18px)', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 9, background: '#15130F', color: '#fff', borderRadius: 14, padding: '12px 18px', boxShadow: '0 14px 30px -12px rgba(0,0,0,.5)', animation: 'faceIn .3s ease', whiteSpace: 'nowrap' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FD07E" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5 }}>Recognition added to their Collection</span>
            </div>
          )}

          <OSBottomNavigation
            items={navItems}
            activeKey={state.tab}
            onSelect={(key) => actions.setTab(key as Tab)}
            centralAction={showFab ? { label: 'Add a memory', onClick: actions.openAdd } : null}
            hidden={anyOverlayOpen}
            ariaLabel={isCoach ? 'Coach navigation' : 'Player navigation'}
          />

      </div>
    </div>
    </OsDataProvider>
  );
}
