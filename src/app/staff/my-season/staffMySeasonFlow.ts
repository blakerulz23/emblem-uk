import {
  STAFF_MY_SEASON_ERRORS,
  checkStaffRemovalReason,
  isUuid,
  parseStaffObservationList,
  parseStaffRemovalStatus,
  stripUnstorableText,
  type MySeasonStaffObservation,
  type StaffMySeasonErrorCode,
  type StaffRemovalStatus,
} from '@/lib/my-season';

/**
 * The staff My Season page's logic as plain functions (no DOM needed): the
 * fetch calls, a reducer for the page state and a controller that runs the
 * lookup and removal flows. Only fixed copy is ever shown. The reason lives
 * in state only while its form is open, and leaves it on success or Cancel.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const STAFF_MY_SEASON_COPY = {
  invalidPlayerId: 'Enter a valid player ID.',
  network: "Couldn't reach the server. Check your connection and try again.",
  noNotes: 'No coach notes for this player.',
  reasonWarning: "Don't paste the note or any child's details here. Say only why it is being removed.",
  confirm: 'I understand this permanently erases the note. It cannot be restored.',
  removed: 'Note removed. Its text has been erased.',
  alreadyRemoved: 'This note had already been withdrawn or removed. Nothing more was changed.',
  stateWithdrawn: 'Withdrawn by the coach. No text is kept.',
  stateRemoved: 'Removed by staff. No text is kept.',
} as const;

export type StaffFailure = { ok: false; message: string; code?: StaffMySeasonErrorCode };

async function failureFrom(res: Response): Promise<StaffFailure> {
  const data = (await res.json().catch(() => null)) as { code?: unknown } | null;
  const known = typeof data?.code === 'string' ? STAFF_MY_SEASON_ERRORS[data.code as StaffMySeasonErrorCode] : undefined;
  return known ? { ok: false, message: known.message, code: known.code } : { ok: false, message: STAFF_MY_SEASON_ERRORS.failed.message };
}

export async function fetchStaffNotes(playerId: string, fetchImpl: FetchLike = fetch): Promise<{ ok: true; notes: MySeasonStaffObservation[] } | StaffFailure> {
  try {
    const res = await fetchImpl(`/api/staff/my-season?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    if (!res.ok) return await failureFrom(res);
    const notes = parseStaffObservationList(await res.json());
    return notes ? { ok: true, notes } : { ok: false, message: STAFF_MY_SEASON_ERRORS.failed.message };
  } catch {
    return { ok: false, message: STAFF_MY_SEASON_COPY.network };
  }
}

export async function postStaffRemoval(observationId: string, reason: string, fetchImpl: FetchLike = fetch): Promise<{ ok: true; status: StaffRemovalStatus } | StaffFailure> {
  try {
    const res = await fetchImpl(`/api/staff/my-season/observations/${encodeURIComponent(observationId)}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: stripUnstorableText(reason).trim() }),
    });
    if (!res.ok) return await failureFrom(res);
    const status = parseStaffRemovalStatus(await res.json());
    return status ? { ok: true, status } : { ok: false, message: STAFF_MY_SEASON_ERRORS.failed.message };
  } catch {
    return { ok: false, message: STAFF_MY_SEASON_COPY.network };
  }
}

export type StaffRemoval = { id: string; reason: string; confirmed: boolean; busy: boolean; error: string | null };
export type StaffFocusTarget = 'player' | 'reason' | 'removal-error' | 'status' | 'list-error';

export type StaffPageState = {
  playerIdDraft: string;
  playerId: string | null;
  list: 'idle' | 'loading' | 'ready' | 'error';
  listError: string | null;
  notes: MySeasonStaffObservation[];
  removal: StaffRemoval | null;
  announcement: string;
  focus: StaffFocusTarget | null;
};

export const INITIAL_STAFF_PAGE: StaffPageState = {
  playerIdDraft: '',
  playerId: null,
  list: 'idle',
  listError: null,
  notes: [],
  removal: null,
  announcement: '',
  focus: null,
};

export type StaffAction =
  | { type: 'draft'; value: string }
  | { type: 'invalid-player' }
  | { type: 'list-start'; playerId: string; keepNotes: boolean }
  | { type: 'list-ok'; notes: MySeasonStaffObservation[] }
  | { type: 'list-failed'; message: string }
  | { type: 'open-removal'; id: string }
  | { type: 'reason'; value: string }
  | { type: 'confirmed'; value: boolean }
  | { type: 'cancel-removal' }
  | { type: 'removal-start' }
  | { type: 'removal-failed'; message: string }
  | { type: 'removal-done'; id: string; status: StaffRemovalStatus }
  | { type: 'focus-done' };

/** No text survives on the page for a note that has been removed. */
export function eraseStaffNote(notes: MySeasonStaffObservation[], id: string): MySeasonStaffObservation[] {
  return notes.map((n): MySeasonStaffObservation => (n.id === id ? { id: n.id, createdAt: n.createdAt, coachName: n.coachName, formerCoach: n.formerCoach, state: 'removed', category: null, body: null } : n));
}

export function staffPageReducer(s: StaffPageState, a: StaffAction): StaffPageState {
  switch (a.type) {
    case 'draft':
      return { ...s, playerIdDraft: a.value };
    case 'invalid-player':
      return { ...s, list: 'error', listError: STAFF_MY_SEASON_COPY.invalidPlayerId, playerId: null, notes: [], removal: null, focus: 'list-error' };
    case 'list-start':
      return { ...s, playerId: a.playerId, list: 'loading', listError: null, notes: a.keepNotes ? s.notes : [], removal: a.keepNotes ? s.removal : null };
    case 'list-ok':
      return { ...s, list: 'ready', listError: null, notes: a.notes };
    case 'list-failed':
      return { ...s, list: 'error', listError: a.message, focus: s.removal ? s.focus : 'list-error' };
    case 'open-removal':
      return { ...s, removal: { id: a.id, reason: '', confirmed: false, busy: false, error: null }, announcement: '', focus: 'reason' };
    case 'reason':
      return s.removal && !s.removal.busy ? { ...s, removal: { ...s.removal, reason: stripUnstorableText(a.value) } } : s;
    case 'confirmed':
      return s.removal && !s.removal.busy ? { ...s, removal: { ...s.removal, confirmed: a.value } } : s;
    case 'cancel-removal':
      return s.removal?.busy ? s : { ...s, removal: null };
    case 'removal-start':
      return s.removal ? { ...s, removal: { ...s.removal, busy: true, error: null } } : s;
    case 'removal-failed':
      return s.removal ? { ...s, removal: { ...s.removal, busy: false, error: a.message }, focus: 'removal-error' } : s;
    case 'removal-done':
      return {
        ...s,
        removal: null,
        notes: eraseStaffNote(s.notes, a.id),
        announcement: a.status === 'removed' ? STAFF_MY_SEASON_COPY.removed : STAFF_MY_SEASON_COPY.alreadyRemoved,
        focus: 'status',
      };
    case 'focus-done':
      return { ...s, focus: null };
  }
}

/** The removal button works only with a valid reason, the box ticked and nothing in flight. */
export function canSubmitRemoval(r: StaffRemoval | null): boolean {
  return !!r && !r.busy && r.confirmed && checkStaffRemovalReason(r.reason).valid;
}

export type StaffController = { lookup: () => Promise<void>; reload: () => Promise<void>; remove: () => Promise<void> };

/**
 * Only the newest lookup may land, and the reload that follows a removal is
 * started in the same tick as the local erase, so a list requested before the
 * removal can never put the text back on the page. A second click while one
 * removal runs does nothing.
 */
export function createStaffController(deps: {
  getState: () => StaffPageState;
  dispatch: (a: StaffAction) => void;
  fetchNotes?: typeof fetchStaffNotes;
  postRemoval?: typeof postStaffRemoval;
}): StaffController {
  const fetchNotes = deps.fetchNotes ?? fetchStaffNotes;
  const postRemoval = deps.postRemoval ?? postStaffRemoval;
  let seq = 0;
  let removing = false;

  const load = async (playerId: string, keepNotes: boolean) => {
    const mine = ++seq;
    deps.dispatch({ type: 'list-start', playerId, keepNotes });
    const result = await fetchNotes(playerId);
    if (mine !== seq) return;
    deps.dispatch(result.ok ? { type: 'list-ok', notes: result.notes } : { type: 'list-failed', message: result.message });
  };

  return {
    async lookup() {
      if (removing) return;
      const playerId = deps.getState().playerIdDraft.trim();
      if (!isUuid(playerId)) {
        seq += 1;
        deps.dispatch({ type: 'invalid-player' });
        return;
      }
      await load(playerId, false);
    },
    async reload() {
      const playerId = deps.getState().playerId;
      if (playerId && !removing) await load(playerId, true);
    },
    async remove() {
      const state = deps.getState();
      const removal = state.removal;
      if (removing || !canSubmitRemoval(removal) || !removal) return;
      removing = true;
      deps.dispatch({ type: 'removal-start' });
      const result = await postRemoval(removal.id, removal.reason).catch((): StaffFailure => ({ ok: false, message: STAFF_MY_SEASON_COPY.network }));
      removing = false;
      if (!result.ok) {
        deps.dispatch({ type: 'removal-failed', message: result.message });
        return;
      }
      deps.dispatch({ type: 'removal-done', id: removal.id, status: result.status });
      if (state.playerId) await load(state.playerId, true);
    },
  };
}
