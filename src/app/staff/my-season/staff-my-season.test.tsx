import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { STAFF_MY_SEASON_ERRORS, checkStaffRemovalReason, parseStaffObservationList, parseStaffRemovalStatus, type MySeasonStaffObservation } from '@/lib/my-season';
import { STAFF_MS_IDS, StaffMySeasonView, staffFocusCandidates } from './StaffMySeasonPanel';
import {
  INITIAL_STAFF_PAGE,
  STAFF_MY_SEASON_COPY,
  canSubmitRemoval,
  createStaffController,
  fetchStaffNotes,
  postStaffRemoval,
  staffPageReducer,
  type StaffAction,
  type StaffPageState,
} from './staffMySeasonFlow';

const PLAYER = '30000000-0000-4000-8000-000000000001';
const OBS = '50000000-0000-4000-8000-000000000001';
const TEXT = 'ZQNOTE kept going after the second goal.';
const active: MySeasonStaffObservation = { id: OBS, createdAt: '2026-11-15T10:00:00Z', state: 'active', coachName: 'Coach Danny', formerCoach: false, category: 'kept_going', body: TEXT };
const closed: MySeasonStaffObservation = { id: OBS, createdAt: '2026-11-15T10:00:00Z', state: 'removed', coachName: 'Coach Danny', formerCoach: false, category: null, body: null };

function harness(initial: Partial<StaffPageState> = {}, deps: Partial<Parameters<typeof createStaffController>[0]> = {}) {
  let state: StaffPageState = { ...INITIAL_STAFF_PAGE, ...initial };
  const actions: StaffAction[] = [];
  const dispatch = (a: StaffAction) => {
    actions.push(a);
    state = staffPageReducer(state, a);
  };
  return { get: () => state, actions, dispatch, controller: createStaffController({ getState: () => state, dispatch, ...deps }) };
}
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const ready: Partial<StaffPageState> = { playerId: PLAYER, playerIdDraft: PLAYER, list: 'ready', notes: [active] };
const armed = (o: Partial<NonNullable<StaffPageState['removal']>> = {}) => ({ ...ready, removal: { id: OBS, reason: 'Reported by the family', confirmed: true, busy: false, error: null, ...o } });
const html = (state: StaffPageState) => renderToStaticMarkup(<StaffMySeasonView state={state} dispatch={() => {}} onLookup={() => {}} onReload={() => {}} onRemove={() => {}} />);

describe('the contract parsers', () => {
  it('reason limits: trimmed, 3 to 500, counted in characters', () => {
    expect(checkStaffRemovalReason('  ab ').valid).toBe(false);
    expect(checkStaffRemovalReason(' abc ')).toMatchObject({ valid: true, value: 'abc' });
    expect(checkStaffRemovalReason('x'.repeat(500)).valid).toBe(true);
    expect(checkStaffRemovalReason('x'.repeat(501)).valid).toBe(false);
    expect(checkStaffRemovalReason('😀😀😀').valid).toBe(true);
    expect(checkStaffRemovalReason('abc\u0000').valid).toBe(false);
  });

  it('list: active needs text and category; closed notes must have neither; unknown states are refused', () => {
    const raw = { id: OBS, createdAt: 'x', coachName: null, formerCoach: true };
    expect(parseStaffObservationList({ observations: [{ ...raw, state: 'active', category: 'kept_going', body: 'Text' }] })).toHaveLength(1);
    expect(parseStaffObservationList({ observations: [{ ...raw, state: 'withdrawn' }] })?.[0]).toMatchObject({ state: 'withdrawn', body: null, category: null });
    for (const bad of [{ ...raw, state: 'active' }, { ...raw, state: 'active', category: 'nope', body: 'x' }, { ...raw, state: 'removed', body: 'x' }, { ...raw, state: 'withdrawn', category: 'kept_going' }, { ...raw, state: 'hidden' }]) {
      expect(parseStaffObservationList({ observations: [bad] })).toBeNull();
    }
    expect(parseStaffObservationList([])).toBeNull();
    expect(parseStaffRemovalStatus({ status: 'removed' })).toBe('removed');
    expect(parseStaffRemovalStatus({ status: 'other' })).toBeNull();
  });
});

describe('the fetch helpers show fixed copy only', () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  it('a known code gives our copy, never the server text; a network failure says so', async () => {
    expect(await fetchStaffNotes(PLAYER, async () => res(404, { code: 'not_found', error: 'LEAK' }))).toMatchObject({ ok: false, message: 'Nothing was found for that ID.' });
    expect(await fetchStaffNotes(PLAYER, async () => res(500, { error: 'LEAK' }))).toMatchObject({ ok: false, message: 'Something went wrong. Try again.' });
    expect(await postStaffRemoval(OBS, 'Reason', async () => { throw new Error('offline'); })).toEqual({ ok: false, message: STAFF_MY_SEASON_COPY.network });
  });
  it('the reason goes in the body only, trimmed', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const f = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return res(200, { status: 'removed' });
    };
    expect(await postStaffRemoval(OBS, '  Reason here ', f)).toEqual({ ok: true, status: 'removed' });
    expect(calls[0][0]).toBe(`/api/staff/my-season/observations/${OBS}/remove`);
    expect(calls[0][1]?.body).toBe('{"reason":"Reason here"}');
  });
});

describe('the removal form rules', () => {
  it('needs a valid reason and the explicit confirmation, and nothing in flight', () => {
    const base = { id: OBS, reason: 'Reported', confirmed: true, busy: false, error: null };
    expect(canSubmitRemoval(base)).toBe(true);
    expect(canSubmitRemoval({ ...base, confirmed: false })).toBe(false);
    expect(canSubmitRemoval({ ...base, reason: ' a ' })).toBe(false);
    expect(canSubmitRemoval({ ...base, busy: true })).toBe(false);
    expect(canSubmitRemoval(null)).toBe(false);
  });

  it('opening the form moves focus to the reason; Cancel drops the reason; the reason cannot change while sending', () => {
    let s = staffPageReducer({ ...INITIAL_STAFF_PAGE, ...ready }, { type: 'open-removal', id: OBS });
    expect(s.focus).toBe('reason');
    s = staffPageReducer(s, { type: 'reason', value: 'Reported' });
    s = staffPageReducer(s, { type: 'removal-start' });
    expect(staffPageReducer(s, { type: 'reason', value: 'Changed' }).removal?.reason).toBe('Reported');
    expect(staffPageReducer(s, { type: 'cancel-removal' }).removal).not.toBeNull();
    const idle = staffPageReducer({ ...s, removal: { ...s.removal!, busy: false } }, { type: 'cancel-removal' });
    expect(idle.removal).toBeNull();
  });

  it('renders the label, warning, confirmation, live status and a disabled button until ready', () => {
    const open = html({ ...INITIAL_STAFF_PAGE, ...armed({ confirmed: false }) });
    expect(open).toContain('Reason (required)');
    expect(open).toContain('any child&#x27;s details');
    expect(open).toContain(STAFF_MY_SEASON_COPY.confirm);
    expect(open).toContain('role="status"');
    expect(open).toMatch(/<button type="submit" disabled=""[^>]*>Remove permanently/);
    expect(open).not.toContain('—');
    expect(html({ ...INITIAL_STAFF_PAGE, ...armed() })).not.toMatch(/<button type="submit" disabled=""[^>]*>Remove permanently/);
    expect(html({ ...INITIAL_STAFF_PAGE, ...armed({ busy: true }) })).toContain('Removing…');
    const failed = html({ ...INITIAL_STAFF_PAGE, ...armed({ error: 'Something went wrong. Try again.' }) });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Retry removal');
  });

  it('Cancel returns focus to that note\'s Remove control, or to the status line if it has gone', () => {
    const open = staffPageReducer({ ...INITIAL_STAFF_PAGE, ...ready }, { type: 'open-removal', id: OBS });
    const s = staffPageReducer(open, { type: 'cancel-removal' });
    expect(s).toMatchObject({ removal: null, focus: 'remove-control', returnFocusNoteId: OBS });
    expect(staffFocusCandidates('remove-control', OBS)).toEqual([STAFF_MS_IDS.remove(OBS), STAFF_MS_IDS.status]);
    expect(staffFocusCandidates('remove-control', null)).toEqual([STAFF_MS_IDS.status]);
    expect(html(s)).toContain(`id="${STAFF_MS_IDS.remove(OBS)}"`);
    expect(html(s)).toContain(`id="${STAFF_MS_IDS.status}" role="status" aria-live="polite" tabindex="-1"`);
    expect(staffPageReducer(s, { type: 'focus-done' })).toMatchObject({ focus: null, returnFocusNoteId: null });
    expect(staffPageReducer({ ...INITIAL_STAFF_PAGE }, { type: 'cancel-removal' }).focus).toBeNull();
  });

  it('says why submit is disabled while the reason is too short, and stops once it is long enough', () => {
    for (const reason of ['', ' a ', 'ab']) {
      const page = html({ ...INITIAL_STAFF_PAGE, ...armed({ reason }) });
      expect(page).toContain(STAFF_MY_SEASON_COPY.reasonTooShort);
      expect(page).toMatch(/<button type="submit" disabled=""[^>]*aria-describedby="staff-ms-reason-hint"/);
      expect(page).toMatch(/<textarea[^>]*aria-describedby="staff-ms-reason-warning staff-ms-reason-hint"/);
    }
    expect(html({ ...INITIAL_STAFF_PAGE, ...armed({ reason: 'abc' }) })).not.toContain(STAFF_MY_SEASON_COPY.reasonTooShort);
  });

  it('closed notes show no text and no Remove control', () => {
    const page = html({ ...INITIAL_STAFF_PAGE, ...ready, notes: [closed, { ...closed, id: 'x', state: 'withdrawn' }] });
    expect(page).toContain(STAFF_MY_SEASON_COPY.stateRemoved);
    expect(page).toContain(STAFF_MY_SEASON_COPY.stateWithdrawn);
    expect(page).not.toContain('Remove…');
  });
});

describe('the flows', () => {
  it('lookup: an invalid id is refused with no request', async () => {
    const fetchNotes = vi.fn();
    const t = harness({ playerIdDraft: 'nope' }, { fetchNotes });
    await t.controller.lookup();
    expect(fetchNotes).not.toHaveBeenCalled();
    expect(t.get()).toMatchObject({ list: 'error', listError: STAFF_MY_SEASON_COPY.invalidPlayerId, focus: 'list-error' });
  });

  it('only the newest lookup lands', async () => {
    const first = deferred<Awaited<ReturnType<typeof fetchStaffNotes>>>();
    const second = deferred<Awaited<ReturnType<typeof fetchStaffNotes>>>();
    const fetchNotes = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const t = harness({ playerIdDraft: PLAYER }, { fetchNotes });
    const a = t.controller.lookup(), b = t.controller.lookup();
    second.resolve({ ok: true, notes: [] });
    first.resolve({ ok: true, notes: [active] });
    await Promise.all([a, b]);
    expect(t.get().notes).toEqual([]);
  });

  for (const status of ['removed', 'already_removed'] as const) {
    it(`${status}: the text and reason leave page state at once, then the list reloads`, async () => {
      const reload = deferred<Awaited<ReturnType<typeof fetchStaffNotes>>>();
      const fetchNotes = vi.fn(() => reload.promise);
      const t = harness(armed(), { fetchNotes, postRemoval: async () => ({ ok: true, status }) });
      const run = t.controller.remove();
      await vi.waitFor(() => expect(fetchNotes).toHaveBeenCalledTimes(1));
      expect(JSON.stringify(t.get())).not.toContain('ZQNOTE');
      expect(JSON.stringify(t.get())).not.toContain('Reported by the family');
      expect(t.get()).toMatchObject({ removal: null, focus: 'status', announcement: status === 'removed' ? STAFF_MY_SEASON_COPY.removed : STAFF_MY_SEASON_COPY.alreadyRemoved });
      reload.resolve({ ok: true, notes: [closed] });
      await run;
      expect(t.get().notes).toEqual([closed]);
    });
  }

  it('a failure keeps the same note and reason for Retry and moves focus to the error; Retry sends them again', async () => {
    const postRemoval = vi.fn().mockResolvedValueOnce({ ok: false, message: 'Something went wrong. Try again.' }).mockResolvedValueOnce({ ok: true, status: 'already_removed' });
    const t = harness(armed(), { postRemoval, fetchNotes: async () => ({ ok: true, notes: [closed] }) });
    await t.controller.remove();
    expect(t.get().removal).toMatchObject({ id: OBS, reason: 'Reported by the family', busy: false, error: 'Something went wrong. Try again.' });
    expect(t.get().focus).toBe('removal-error');
    await t.controller.remove();
    expect(postRemoval).toHaveBeenCalledTimes(2);
    expect(postRemoval.mock.calls[1]).toEqual([OBS, 'Reported by the family']);
    expect(t.get().removal).toBeNull();
  });

  it('a reason repeating the note: the refusal is clear, the draft stays, and editing it clears the refusal', async () => {
    const refusal = STAFF_MY_SEASON_ERRORS.invalid_reason;
    expect(refusal.message).toContain("Don't repeat the note");
    expect(refusal.message).not.toContain('—');
    const t = harness(armed(), { postRemoval: async () => ({ ok: false, message: refusal.message, code: refusal.code }) });
    await t.controller.remove();
    expect(t.get().removal).toMatchObject({ reason: 'Reported by the family', confirmed: true, busy: false, error: refusal.message, errorCode: 'invalid_reason' });
    expect(t.get().focus).toBe('removal-error');
    const page = html(t.get());
    expect(page).toContain('Don&#x27;t repeat the note');
    expect(page).toContain('role="alert"');
    expect(page).toContain('>Reported by the family</textarea>');
    expect(page).toContain('aria-invalid="true"');
    expect(page).not.toContain('Retry removal');
    t.dispatch({ type: 'reason', value: 'A different reason' });
    expect(t.get().removal).toMatchObject({ reason: 'A different reason', error: null });
    expect(t.get().removal?.errorCode).toBeUndefined();
  });

  it('other failures survive an edit of the reason and still offer Retry', () => {
    const s = staffPageReducer({ ...INITIAL_STAFF_PAGE, ...armed() }, { type: 'removal-failed', message: 'Something went wrong. Try again.', code: 'failed' });
    expect(html(s)).toContain('Retry removal');
    expect(staffPageReducer(s, { type: 'reason', value: 'Changed' }).removal?.error).toBe('Something went wrong. Try again.');
  });

  it('already_removed never claims staff removed it if the reload fails', async () => {
    const t = harness(armed(), { postRemoval: async () => ({ ok: true, status: 'already_removed' }), fetchNotes: async () => ({ ok: false, message: 'Something went wrong. Try again.' }) });
    await t.controller.remove();
    expect(t.get().notes[0]).toMatchObject({ state: 'closed', body: null, category: null });
    const page = html(t.get());
    expect(page).toContain(STAFF_MY_SEASON_COPY.stateClosed);
    expect(page).not.toContain(STAFF_MY_SEASON_COPY.stateRemoved);
    expect(page).not.toContain('Remove…');
  });

  it('a successful removal does say staff removed it, even if the reload fails', async () => {
    const t = harness(armed(), { postRemoval: async () => ({ ok: true, status: 'removed' }), fetchNotes: async () => ({ ok: false, message: 'x' }) });
    await t.controller.remove();
    expect(html(t.get())).toContain(STAFF_MY_SEASON_COPY.stateRemoved);
  });

  it('a double click sends once; nothing is sent unconfirmed', async () => {
    const pending = deferred<Awaited<ReturnType<typeof postStaffRemoval>>>();
    const postRemoval = vi.fn(() => pending.promise);
    const t = harness(armed(), { postRemoval, fetchNotes: async () => ({ ok: true, notes: [] }) });
    const a = t.controller.remove();
    await t.controller.remove();
    expect(postRemoval).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, status: 'removed' });
    await a;
    const u = harness(armed({ confirmed: false }), { postRemoval });
    await u.controller.remove();
    expect(postRemoval).toHaveBeenCalledTimes(1);
  });

  it('a list requested before the removal can never put the text back', async () => {
    const old = deferred<Awaited<ReturnType<typeof fetchStaffNotes>>>();
    const fetchNotes = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ ok: true, notes: [closed] });
    const t = harness(armed(), { fetchNotes, postRemoval: async () => ({ ok: true, status: 'removed' }) });
    const stale = t.controller.reload();
    await t.controller.remove();
    old.resolve({ ok: true, notes: [active] });
    await stale;
    expect(JSON.stringify(t.get())).not.toContain('ZQNOTE');
  });

  it('a failed reload after a removal keeps the erased state and offers Retry', async () => {
    const t = harness(armed(), { postRemoval: async () => ({ ok: true, status: 'removed' }), fetchNotes: async () => ({ ok: false, message: 'Something went wrong. Try again.' }) });
    await t.controller.remove();
    expect(t.get().list).toBe('error');
    expect(JSON.stringify(t.get().notes)).not.toContain('ZQNOTE');
    expect(html(t.get())).toContain('>Retry<');
  });
});
