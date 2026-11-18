/**
 * My Season (Phase 1): shared, server-safe contract for the app.
 *
 * - The six observation categories (labels/emoji/hints shown to coaches and
 *   families).
 * - Validators that mirror the database checks in
 *   0108_my_season_focus_and_observations.sql exactly, so the app rejects
 *   bad input before the RPC does (the RPC remains the real boundary).
 * - Types for the JSON returned by my_season_for_player, plus a strict
 *   parser: anything that does not match the contract is treated as "not
 *   available" rather than rendered.
 * - The EMS01..EMS09 SQLSTATE map to fixed, data-free messages.
 *
 * Imported by API routes, os-data (server) and the OS client components.
 * It must never read process.env or import a Supabase client.
 */

export type MySeasonCategoryKey =
  | 'lifted_the_team'
  | 'kept_going'
  | 'tried_something_new'
  | 'helped_someone_belong'
  | 'spoke_up'
  | 'came_back_stronger';

export type MySeasonCategory = { key: MySeasonCategoryKey; label: string; emoji: string; hint: string };

export const MY_SEASON_CATEGORIES: readonly MySeasonCategory[] = [
  { key: 'lifted_the_team', label: 'Lifted the team', emoji: '🙌', hint: 'Raised the people around them' },
  { key: 'kept_going', label: 'Kept going', emoji: '💪', hint: 'Carried on when it was hard' },
  { key: 'tried_something_new', label: 'Tried something new', emoji: '🌱', hint: 'Had a go at something unfamiliar' },
  { key: 'helped_someone_belong', label: 'Helped someone belong', emoji: '🤝', hint: 'Made a teammate feel included' },
  { key: 'spoke_up', label: 'Spoke up', emoji: '🗣️', hint: 'Used their voice on the pitch' },
  { key: 'came_back_stronger', label: 'Came back stronger', emoji: '🔁', hint: 'Returned after a setback' },
];

export function isMySeasonCategory(value: unknown): value is MySeasonCategoryKey {
  return typeof value === 'string' && MY_SEASON_CATEGORIES.some((c) => c.key === value);
}

export function mySeasonCategory(key: string): MySeasonCategory | null {
  return MY_SEASON_CATEGORIES.find((c) => c.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Limits (mirror the CHECK constraints and RPC validation in 0108)
// ---------------------------------------------------------------------------

export const FOCUS_TITLE_MIN = 3;
export const FOCUS_TITLE_MAX = 60;
export const FOCUS_TEXT_MIN = 3;
export const FOCUS_TEXT_MAX = 160;
export const OBSERVATION_MIN = 20;
export const OBSERVATION_MAX = 160;
export const OBSERVATION_MAX_SENTENCES = 2;
/** started_on may not be before this date (RPC rule). */
export const FOCUS_EARLIEST_START = '2000-01-01';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Postgres char_length counts code points, not UTF-16 units. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/**
 * Sentence count as the database counts it: runs of `.`, `!` or `?`
 * followed by whitespace or the end of the text. "Great game!!" is one;
 * "3.5 seconds" is none (no whitespace after the dot).
 */
export function countSentences(value: string): number {
  return (value.trim().match(/[.!?]+(?=\s|$)/g) ?? []).length;
}

export type ObservationCheck = {
  /** Trimmed body. */
  value: string;
  length: number;
  sentences: number;
  tooShort: boolean;
  tooLong: boolean;
  tooManySentences: boolean;
  valid: boolean;
};

export function checkObservationBody(raw: string): ObservationCheck {
  const value = raw.trim();
  const length = charLength(value);
  const sentences = countSentences(value);
  const tooShort = length < OBSERVATION_MIN;
  const tooLong = length > OBSERVATION_MAX;
  const tooManySentences = sentences > OBSERVATION_MAX_SENTENCES;
  return { value, length, sentences, tooShort, tooLong, tooManySentences, valid: !tooShort && !tooLong && !tooManySentences };
}

const LONE_SURROGATE = new RegExp('\\p{Cs}', 'u');
const UNSTORABLE_TEXT = new RegExp('\\u0000|\\p{Cs}', 'gu');

/**
 * True for text PostgreSQL cannot store (NUL, or a lone surrogate). Refused
 * before the RPC: casting such JSON fails inside the database, and that
 * error's context quotes the surrounding JSON, note text included, into the
 * server log.
 */
export function hasUnstorableText(value: string): boolean {
  return value.includes('\u0000') || LONE_SURROGATE.test(value);
}

/**
 * The text without those characters. The forms apply it as the user types or
 * pastes, so nobody is left with a refusal they cannot see the reason for.
 */
export function stripUnstorableText(value: string): string {
  return value.replace(UNSTORABLE_TEXT, '');
}

export type ObservationInput = { playerId: string; category: MySeasonCategoryKey; body: string; requestId: string };

export function validateObservationInput(raw: unknown): { ok: true; value: ObservationInput } | { ok: false } {
  if (!raw || typeof raw !== 'object') return { ok: false };
  const r = raw as Record<string, unknown>;
  if (!isUuid(r.playerId) || !isUuid(r.requestId) || !isMySeasonCategory(r.category) || typeof r.body !== 'string') return { ok: false };
  if (hasUnstorableText(r.body)) return { ok: false };
  const check = checkObservationBody(r.body);
  if (!check.valid) return { ok: false };
  return { ok: true, value: { playerId: r.playerId, category: r.category, body: check.value, requestId: r.requestId } };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Today's date (UTC) as YYYY-MM-DD, offset by `days`. */
export function isoDateUtc(now: Date = new Date(), days = 0): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** started_on: not before 2000-01-01 and not more than one day in the future. */
export function isValidFocusStart(value: unknown, now: Date = new Date()): value is string {
  return isIsoDate(value) && value >= FOCUS_EARLIEST_START && value <= isoDateUtc(now, 1);
}

export type FocusField = 'title' | 'whyItMatters' | 'whatItLooksLike' | 'startedOn';

export type FocusDraft = { title: string; whyItMatters: string; whatItLooksLike: string; startedOn: string };

/** Field-level problems for the Change focus form (empty when valid). */
export function focusDraftProblems(draft: FocusDraft, now: Date = new Date()): FocusField[] {
  const problems: FocusField[] = [];
  const title = charLength(draft.title.trim());
  if (title < FOCUS_TITLE_MIN || title > FOCUS_TITLE_MAX) problems.push('title');
  const why = charLength(draft.whyItMatters.trim());
  if (why < FOCUS_TEXT_MIN || why > FOCUS_TEXT_MAX) problems.push('whyItMatters');
  const looks = charLength(draft.whatItLooksLike.trim());
  if (looks < FOCUS_TEXT_MIN || looks > FOCUS_TEXT_MAX) problems.push('whatItLooksLike');
  if (!isValidFocusStart(draft.startedOn, now)) problems.push('startedOn');
  return problems;
}

export type FocusInput = FocusDraft & { playerId: string; requestId: string };

export function validateFocusInput(raw: unknown, now: Date = new Date()): { ok: true; value: FocusInput } | { ok: false } {
  if (!raw || typeof raw !== 'object') return { ok: false };
  const r = raw as Record<string, unknown>;
  if (!isUuid(r.playerId) || !isUuid(r.requestId)) return { ok: false };
  if (typeof r.title !== 'string' || typeof r.whyItMatters !== 'string' || typeof r.whatItLooksLike !== 'string' || typeof r.startedOn !== 'string') {
    return { ok: false };
  }
  if ([r.title, r.whyItMatters, r.whatItLooksLike].some(hasUnstorableText)) return { ok: false };
  const draft: FocusDraft = { title: r.title.trim(), whyItMatters: r.whyItMatters.trim(), whatItLooksLike: r.whatItLooksLike.trim(), startedOn: r.startedOn };
  if (focusDraftProblems(draft, now).length) return { ok: false };
  return { ok: true, value: { ...draft, playerId: r.playerId, requestId: r.requestId } };
}

// ---------------------------------------------------------------------------
// my_season_for_player JSON contract
// ---------------------------------------------------------------------------

export type MySeasonFocus = {
  id: string;
  title: string;
  whyItMatters: string;
  whatItLooksLike: string;
  startedOn: string;
  endedAt: string | null;
  authorRole: 'guardian' | 'coach';
  /** Null when the author's account was deleted. */
  authorName: string | null;
};

type MySeasonObservationBase = {
  id: string;
  createdAt: string;
  /** Null when the coach's account was deleted ("A former coach"). */
  coachName: string | null;
  formerCoach: boolean;
  mine: boolean;
};

export type MySeasonActiveObservation = MySeasonObservationBase & {
  withdrawn: false;
  category: MySeasonCategoryKey;
  body: string;
};

/**
 * Withdrawing (or staff removal) erases the content: only its author gets
 * this row, with no text or category. `removedByStaff` is present, and true,
 * only when Emblem staff removed it.
 */
export type MySeasonWithdrawnObservation = MySeasonObservationBase & {
  withdrawn: true;
  category: null;
  body: null;
  removedByStaff?: true;
};

export type MySeasonObservation = MySeasonActiveObservation | MySeasonWithdrawnObservation;

export type MySeasonNoAccessReason = 'private_coach' | 'former_coach' | 'account_review';

export type MySeasonContent = {
  enabled: true;
  access: 'guardian' | 'coach';
  canEditFocus: boolean;
  canAddNote: boolean;
  activeFocus: MySeasonFocus | null;
  earlierFocuses: MySeasonFocus[];
  observations: MySeasonObservation[];
};

export type MySeasonView =
  | { enabled: false }
  | { enabled: true; access: 'none'; reason: MySeasonNoAccessReason | 'unavailable' }
  | MySeasonContent;

/**
 * The parent load's answer when the server says the feature is on but its
 * view breaks the contract. Never accepted from the wire: parseMySeasonView
 * does not know this reason. It keeps the legacy Season Focus hidden.
 */
export const MY_SEASON_UNAVAILABLE_VIEW: MySeasonView = { enabled: true, access: 'none', reason: 'unavailable' };

/**
 * The parent load's answer when the lookup itself failed: nobody knows whether
 * the feature is on, so most families (feature off) must see nothing about it.
 * Never accepted from the wire.
 */
export const MY_SEASON_UNKNOWN_STATE = { enabled: 'unknown' } as const;
export type MySeasonParentState = MySeasonView | typeof MY_SEASON_UNKNOWN_STATE;

/** The legacy POST's refusal once the feature is on for the player. */
export const LEGACY_FOCUS_REPLACED_CODE = 'my_season_enabled';
export const LEGACY_FOCUS_REPLACED_MESSAGE = 'This player now uses My Season. Close and reopen the app to see it.';
/** Closing the player screen remounts it, which repeats the My Season lookup. */
export const LEGACY_FOCUS_REPLACED_COACH_MESSAGE = 'This player now uses My Season. Close this player screen and reopen it to continue.';

/** What a failed legacy "add focus" shows, in words that fit the screen it failed on. */
export function legacyFocusAddError(
  data: { error?: unknown; code?: unknown } | null | undefined,
  audience: 'coach' | 'family',
): string {
  if (data?.code === LEGACY_FOCUS_REPLACED_CODE) {
    return audience === 'coach' ? LEGACY_FOCUS_REPLACED_COACH_MESSAGE : LEGACY_FOCUS_REPLACED_MESSAGE;
  }
  return typeof data?.error === 'string' && data.error ? data.error : 'Could not add that focus';
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function parseFocus(raw: unknown): MySeasonFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (!isStr(f.id) || !isStr(f.title) || !isStr(f.whyItMatters) || !isStr(f.whatItLooksLike) || !isStr(f.startedOn)) return null;
  if (!isStrOrNull(f.endedAt ?? null) || !isStrOrNull(f.authorName ?? null)) return null;
  if (f.authorRole !== 'guardian' && f.authorRole !== 'coach') return null;
  return {
    id: f.id,
    title: f.title,
    whyItMatters: f.whyItMatters,
    whatItLooksLike: f.whatItLooksLike,
    startedOn: f.startedOn,
    endedAt: (f.endedAt ?? null) as string | null,
    authorRole: f.authorRole,
    authorName: (f.authorName ?? null) as string | null,
  };
}

function parseObservation(raw: unknown): MySeasonObservation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.createdAt)) return null;
  if (!isStrOrNull(o.coachName ?? null) || !isBool(o.formerCoach) || !isBool(o.mine) || !isBool(o.withdrawn)) return null;
  const base: MySeasonObservationBase = {
    id: o.id,
    createdAt: o.createdAt,
    coachName: (o.coachName ?? null) as string | null,
    formerCoach: o.formerCoach,
    mine: o.mine,
  };
  const removed = o.removedByStaff ?? false;
  if (!isBool(removed)) return null;
  if (o.withdrawn) {
    // Exactly null: a withdrawn row that carries any content is refused.
    if (o.category !== null || o.body !== null) return null;
    return removed ? { ...base, withdrawn: true, category: null, body: null, removedByStaff: true } : { ...base, withdrawn: true, category: null, body: null };
  }
  // Removal erases the note, so a "removed" row with content breaks the contract.
  if (removed) return null;
  if (!isMySeasonCategory(o.category) || !isStr(o.body) || !o.body) return null;
  return { ...base, withdrawn: false, category: o.category, body: o.body };
}

/** Strict parse of my_season_for_player's JSON. Null = does not match the contract. */
export function parseMySeasonView(raw: unknown): MySeasonView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.enabled === false) return { enabled: false };
  if (v.enabled !== true) return null;
  if (v.access === 'none') {
    if (v.reason === 'private_coach' || v.reason === 'former_coach' || v.reason === 'account_review') {
      return { enabled: true, access: 'none', reason: v.reason };
    }
    return null;
  }
  if (v.access !== 'guardian' && v.access !== 'coach') return null;
  if (!isBool(v.canEditFocus) || !isBool(v.canAddNote)) return null;
  const activeFocus = v.activeFocus == null ? null : parseFocus(v.activeFocus);
  if (v.activeFocus != null && !activeFocus) return null;
  const earlierRaw = v.earlierFocuses ?? [];
  const obsRaw = v.observations ?? [];
  if (!Array.isArray(earlierRaw) || !Array.isArray(obsRaw)) return null;
  const earlierFocuses = earlierRaw.map(parseFocus);
  const observations = obsRaw.map(parseObservation);
  if (earlierFocuses.some((f) => !f) || observations.some((o) => !o)) return null;
  return {
    enabled: true,
    access: v.access,
    canEditFocus: v.canEditFocus,
    canAddNote: v.canAddNote,
    activeFocus,
    earlierFocuses: earlierFocuses as MySeasonFocus[],
    observations: observations as MySeasonObservation[],
  };
}

export function hasMySeasonContent(view: MySeasonParentState | null | undefined): view is MySeasonContent {
  return !!view && view.enabled === true && view.access !== 'none';
}

/** Only the parent view's server load keeps a view: disabled or broken => null. */
export function enabledViewOrNull(view: MySeasonView | null): MySeasonView | null {
  return view && view.enabled ? view : null;
}

/** True when a raw answer claims the feature is on, whatever else it holds. */
export function rawViewSaysEnabled(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as { enabled?: unknown }).enabled === true;
}

/**
 * The parent load: an enabled view, or null when the server confirmed the
 * feature is off. An unusable answer that claims the feature is on gives the
 * "unavailable" marker; anything else unreadable says nothing about the flag
 * and gives the "unknown" state, so the legacy Add must not become actionable.
 */
export function parentViewFromRaw(raw: unknown): MySeasonParentState | null {
  const view = parseMySeasonView(raw);
  if (view) return enabledViewOrNull(view);
  return rawViewSaysEnabled(raw) ? MY_SEASON_UNAVAILABLE_VIEW : MY_SEASON_UNKNOWN_STATE;
}

/** The RPC does not exist yet (0108 not applied): PostgREST or Postgres wording. */
export function isMissingMySeasonFunction(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

// ---------------------------------------------------------------------------
// SQLSTATE EMS01..EMS09 -> safe JSON errors (no data, fixed copy)
// ---------------------------------------------------------------------------

export type MySeasonErrorCode =
  | 'sign_in_required'
  | 'not_available'
  | 'deploy_off'
  | 'not_allowed'
  | 'account_review'
  | 'invalid_input'
  | 'request_conflict'
  | 'own_child'
  | 'view_invalid'
  | 'failed';

export type MySeasonError = { status: number; code: MySeasonErrorCode; message: string };

export const MY_SEASON_ERRORS: Record<MySeasonErrorCode, MySeasonError> = {
  sign_in_required: { status: 401, code: 'sign_in_required', message: 'Sign in required.' },
  not_available: { status: 404, code: 'not_available', message: "My Season isn't available for this player." },
  // The deploy kill switch is on. Its own code: clients treat exactly this 404
  // as "confirmed off", and every other 404 as a failed lookup.
  deploy_off: { status: 404, code: 'deploy_off', message: "My Season isn't available for this player." },
  not_allowed: { status: 403, code: 'not_allowed', message: "You can't make this change for this player." },
  account_review: { status: 403, code: 'account_review', message: 'My Season is paused while your account is being reviewed.' },
  invalid_input: { status: 400, code: 'invalid_input', message: "Check what you've written and try again." },
  request_conflict: { status: 409, code: 'request_conflict', message: "This couldn't be saved because it clashes with an earlier attempt. Please try again." },
  own_child: { status: 403, code: 'own_child', message: "You can't add notes for your own child. Another coach on the team can." },
  // The RPC said the feature is on but its view broke the contract.
  view_invalid: { status: 500, code: 'view_invalid', message: 'Something went wrong. Try again.' },
  failed: { status: 500, code: 'failed', message: 'Something went wrong. Try again.' },
};

/** EMS07 from the withdraw RPC: the shared own_child code, with wording about withdrawing. */
export const MY_SEASON_OWN_CHILD_WITHDRAW_ERROR: MySeasonError = {
  ...MY_SEASON_ERRORS.own_child,
  message: "You can't withdraw coach notes for your own child.",
};

const SQLSTATE_TO_CODE: Record<string, MySeasonErrorCode> = {
  EMS01: 'sign_in_required',
  EMS02: 'not_available',
  EMS03: 'not_allowed',
  EMS04: 'account_review',
  EMS05: 'invalid_input',
  EMS06: 'request_conflict',
  EMS07: 'own_child',
  // EMS08 is no longer raised (withdrawing an unknown note is EMS03, so the
  // route is not an existence oracle). EMS09 (my_season_conflict, or a
  // trigger refusal the RPCs never reach) and anything else not listed fall
  // through to the generic failure: nothing was written and a retry works.
};

/** Maps a Postgres/PostgREST error to a fixed, data-free error. The DB message is never passed through. */
export function mySeasonErrorFor(error: { code?: string | null } | null | undefined): MySeasonError {
  const code = error?.code ? SQLSTATE_TO_CODE[error.code] : undefined;
  return MY_SEASON_ERRORS[code ?? 'failed'];
}

// ---------------------------------------------------------------------------
// Staff removal (internal staff tool; mirrors section 6 of 0108)
// ---------------------------------------------------------------------------

export const STAFF_REASON_MIN = 3;
export const STAFF_REASON_MAX = 500;

export type StaffReasonCheck = { value: string; length: number; tooShort: boolean; tooLong: boolean; valid: boolean };

export function checkStaffRemovalReason(raw: string): StaffReasonCheck {
  const value = raw.trim();
  const length = charLength(value);
  const tooShort = length < STAFF_REASON_MIN;
  const tooLong = length > STAFF_REASON_MAX;
  return { value, length, tooShort, tooLong, valid: !tooShort && !tooLong && !hasUnstorableText(value) };
}

/** The POST body: exactly a usable `reason`. The refusal never says why or repeats it. */
export function validateStaffRemovalBody(raw: unknown): { ok: true; reason: string } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const reason = (raw as Record<string, unknown>).reason;
  if (typeof reason !== 'string') return { ok: false };
  const check = checkStaffRemovalReason(reason);
  return check.valid ? { ok: true, reason: check.value } : { ok: false };
}

type StaffObservationBase = { id: string; createdAt: string; coachName: string | null; formerCoach: boolean };
export type MySeasonStaffActiveObservation = StaffObservationBase & { state: 'active'; category: MySeasonCategoryKey; body: string };
/** 'closed' is local to the staff page: closed, but the server has not said by whom. */
export type MySeasonStaffClosedObservation = StaffObservationBase & { state: 'withdrawn' | 'removed' | 'closed'; category: null; body: null };
export type MySeasonStaffObservation = MySeasonStaffActiveObservation | MySeasonStaffClosedObservation;

function parseStaffObservation(raw: unknown): MySeasonStaffObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isUuid(o.id) || !isStr(o.createdAt) || !isStrOrNull(o.coachName ?? null) || !isBool(o.formerCoach)) return null;
  const base: StaffObservationBase = { id: o.id, createdAt: o.createdAt, coachName: (o.coachName ?? null) as string | null, formerCoach: o.formerCoach };
  if (o.state === 'active') {
    if (!isMySeasonCategory(o.category) || !isStr(o.body) || !o.body) return null;
    return { ...base, state: 'active', category: o.category, body: o.body };
  }
  if (o.state !== 'withdrawn' && o.state !== 'removed') return null;
  // A closed note has no content: any text or category breaks the contract.
  if ((o.category ?? null) !== null || (o.body ?? null) !== null) return null;
  return { ...base, state: o.state, category: null, body: null };
}

/** Strict parse of my_season_staff_list_observations. Null = does not match the contract. */
export function parseStaffObservationList(raw: unknown): MySeasonStaffObservation[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const list = (raw as Record<string, unknown>).observations;
  if (!Array.isArray(list)) return null;
  const parsed = list.map(parseStaffObservation);
  return parsed.some((o) => !o) ? null : (parsed as MySeasonStaffObservation[]);
}

export type StaffRemovalStatus = 'removed' | 'already_removed';

export function parseStaffRemovalStatus(raw: unknown): StaffRemovalStatus | null {
  const status = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).status : null;
  return status === 'removed' || status === 'already_removed' ? status : null;
}

export type StaffMySeasonErrorCode = 'sign_in_required' | 'staff_required' | 'invalid_input' | 'invalid_reason' | 'not_found' | 'conflict' | 'failed';
export type StaffMySeasonError = { status: number; code: StaffMySeasonErrorCode; message: string };

export const STAFF_MY_SEASON_ERRORS: Record<StaffMySeasonErrorCode, StaffMySeasonError> = {
  sign_in_required: { status: 401, code: 'sign_in_required', message: 'Sign in required.' },
  staff_required: { status: 403, code: 'staff_required', message: 'Staff access required.' },
  invalid_input: { status: 400, code: 'invalid_input', message: 'Check the ID and try again.' },
  // Also the answer when the reason repeats the note (the RPC does not say which).
  invalid_reason: { status: 400, code: 'invalid_reason', message: `That reason can't be used. Don't repeat the note: say why it is being removed, in ${STAFF_REASON_MIN} to ${STAFF_REASON_MAX} characters.` },
  not_found: { status: 404, code: 'not_found', message: 'Nothing was found for that ID.' },
  conflict: { status: 409, code: 'conflict', message: 'That changed while you were working. Reload and try again.' },
  failed: { status: 500, code: 'failed', message: 'Something went wrong. Try again.' },
};

const STAFF_SQLSTATE_TO_CODE: Record<string, StaffMySeasonErrorCode> = {
  EMS08: 'not_found',
  EMS09: 'conflict',
  EMS10: 'staff_required',
  EMS11: 'invalid_reason',
};

/** Maps a staff RPC failure to fixed copy. The database message is never passed through. */
export function staffMySeasonErrorFor(error: { code?: string | null } | null | undefined): StaffMySeasonError {
  const code = error?.code ? STAFF_SQLSTATE_TO_CODE[error.code] : undefined;
  return STAFF_MY_SEASON_ERRORS[code ?? 'failed'];
}

// ---------------------------------------------------------------------------
// Display helpers shared by the family and coach UI
// ---------------------------------------------------------------------------

export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'your player';
}

/** "6 Sept 2026" (en-GB). Accepts YYYY-MM-DD or a full timestamp. */
export function formatMySeasonDate(value: string): string {
  const d = new Date(DATE_RE.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Apr 2026" (en-GB). */
export function formatMySeasonMonth(value: string): string {
  const d = new Date(DATE_RE.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function focusAuthorLine(focus: MySeasonFocus): string {
  if (focus.authorRole === 'guardian') return 'Set by a parent';
  return `Agreed with ${focus.authorName ?? 'a former coach'}`;
}

export function observationAuthor(o: Pick<MySeasonObservation, 'coachName'>): string {
  return o.coachName ?? 'A former coach';
}

/** Observations created on or after the focus's start date (local day). */
export function notesSinceFocus(observations: MySeasonObservation[], focus: MySeasonFocus): MySeasonActiveObservation[] {
  const start = new Date(`${focus.startedOn}T00:00:00`).getTime();
  return observations.filter((o): o is MySeasonActiveObservation => !o.withdrawn && new Date(o.createdAt).getTime() >= start);
}

export function visibleFamilyObservations(view: MySeasonContent): MySeasonActiveObservation[] {
  return view.observations.filter((o): o is MySeasonActiveObservation => !o.withdrawn);
}

/**
 * The view with one note's content removed, applied as soon as a withdrawal
 * succeeds so the text does not stay in client state (even if the reload
 * that follows fails).
 */
export function eraseObservationFromView(view: MySeasonView, observationId: string): MySeasonView {
  if (!hasMySeasonContent(view)) return view;
  return {
    ...view,
    observations: view.observations.map((o): MySeasonObservation =>
      o.id === observationId ? { id: o.id, createdAt: o.createdAt, coachName: o.coachName, formerCoach: o.formerCoach, mine: o.mine, withdrawn: true, category: null, body: null } : o
    ),
  };
}
