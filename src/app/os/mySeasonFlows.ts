'use client';

import { useEffect, useState } from 'react';
import {
  FOCUS_EARLIEST_START,
  FOCUS_TEXT_MAX,
  FOCUS_TEXT_MIN,
  FOCUS_TITLE_MAX,
  FOCUS_TITLE_MIN,
  OBSERVATION_MAX,
  charLength,
  hasMySeasonContent,
  isIsoDate,
  isoDateUtc,
  visibleFamilyObservations,
  type FocusDraft,
  type FocusField,
  type MySeasonCategoryKey,
  type MySeasonView,
  type ObservationCheck,
} from '@/lib/my-season';
import { GENERIC_SAVE_ERROR, newRequestId, todayLocalIso, type AddNoteResult, type WriteResult } from './mySeasonClient';

/**
 * The stateful parts of the My Season editors, overlay and coach panel as
 * plain functions (no DOM needed), so the flows are unit-tested directly:
 * per-field validation copy, request-id reuse, the double-submit guard,
 * Escape with unsaved changes, the dialog's Tab trap and where focus goes
 * after a step unmounts. The components only wire these up.
 */

// ---------------------------------------------------------------------------
// Copy (customer-visible; no em dashes, no ranking language)
// ---------------------------------------------------------------------------

export const MY_SEASON_FORM_COPY = {
  titleHint: `${FOCUS_TITLE_MIN} to ${FOCUS_TITLE_MAX} characters.`,
  textHint: `${FOCUS_TEXT_MIN} to ${FOCUS_TEXT_MAX} characters.`,
  tooShort: (min: number) => `Too short: at least ${min} characters.`,
  tooLong: (max: number) => `Too long: ${max} characters at most.`,
  dateHint: 'Today or earlier. Tomorrow at the latest.',
  dateMissing: 'Pick a start date.',
  dateTooEarly: 'Pick a date from 2000 onwards.',
  dateTooLate: "The start date can't be after tomorrow.",
  noteTooLong: `Too long: ${OBSERVATION_MAX} characters at most.`,
  unsavedEscape: 'You have unsaved changes. Save them, or press Cancel to discard them.',
} as const;

// ---------------------------------------------------------------------------
// Focus editor: per-field messages and the date limit
// ---------------------------------------------------------------------------

export type FieldMessage = { text: string; invalid: boolean };

/** Tomorrow as a local YYYY-MM-DD. */
export function tomorrowLocalIso(now: Date = new Date()): string {
  return todayLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

/**
 * The date picker's max: tomorrow in local time, capped at tomorrow UTC
 * (the server's rule) so the picker never offers a day the server refuses.
 */
export function focusStartMax(now: Date = new Date()): string {
  const local = tomorrowLocalIso(now);
  const utc = isoDateUtc(now, 1);
  return local < utc ? local : utc;
}

function lengthMessage(value: string, min: number, max: number, hint: string): FieldMessage {
  const n = charLength(value.trim());
  if (n === 0) return { text: hint, invalid: false };
  if (n < min) return { text: MY_SEASON_FORM_COPY.tooShort(min), invalid: true };
  if (n > max) return { text: MY_SEASON_FORM_COPY.tooLong(max), invalid: true };
  return { text: hint, invalid: false };
}

/**
 * One message per field explaining why Save is disabled. An empty text
 * field shows its rule (not marked invalid yet); a too short / too long one
 * says so and is invalid. Mirrors focusDraftProblems (the same limits).
 */
export function focusFieldMessages(draft: FocusDraft, now: Date = new Date()): Record<FocusField, FieldMessage> {
  let startedOn: FieldMessage;
  if (draft.startedOn === '') startedOn = { text: MY_SEASON_FORM_COPY.dateMissing, invalid: true };
  else if (!isIsoDate(draft.startedOn)) startedOn = { text: MY_SEASON_FORM_COPY.dateMissing, invalid: true };
  else if (draft.startedOn < FOCUS_EARLIEST_START) startedOn = { text: MY_SEASON_FORM_COPY.dateTooEarly, invalid: true };
  else if (draft.startedOn > isoDateUtc(now, 1)) startedOn = { text: MY_SEASON_FORM_COPY.dateTooLate, invalid: true };
  else startedOn = { text: MY_SEASON_FORM_COPY.dateHint, invalid: false };
  return {
    title: lengthMessage(draft.title, FOCUS_TITLE_MIN, FOCUS_TITLE_MAX, MY_SEASON_FORM_COPY.titleHint),
    whyItMatters: lengthMessage(draft.whyItMatters, FOCUS_TEXT_MIN, FOCUS_TEXT_MAX, MY_SEASON_FORM_COPY.textHint),
    whatItLooksLike: lengthMessage(draft.whatItLooksLike, FOCUS_TEXT_MIN, FOCUS_TEXT_MAX, MY_SEASON_FORM_COPY.textHint),
    startedOn,
  };
}

/**
 * What "Save focus" does: nothing while invalid or busy; ask first when it
 * would replace an active focus; otherwise save.
 */
export function focusSubmitAction(o: { valid: boolean; busy: boolean; hasActiveFocus: boolean; step: 'edit' | 'confirm' }): 'none' | 'confirm' | 'save' {
  if (!o.valid || o.busy) return 'none';
  if (o.hasActiveFocus && o.step === 'edit') return 'confirm';
  return 'save';
}

export function focusDraftDirty(initial: FocusDraft, draft: FocusDraft): boolean {
  return (
    initial.title !== draft.title ||
    initial.whyItMatters !== draft.whyItMatters ||
    initial.whatItLooksLike !== draft.whatItLooksLike ||
    initial.startedOn !== draft.startedOn
  );
}

export function noteDirty(initial: { category: string | null; body: string }, current: { category: string | null; body: string }): boolean {
  return initial.category !== current.category || initial.body !== current.body;
}

// ---------------------------------------------------------------------------
// Note composer: hint and the one live announcement
// ---------------------------------------------------------------------------

export const NOTE_SENTENCE_HINT = 'One or two sentences about what you saw.';
export const NOTE_TOO_MANY_SENTENCES = 'Keep it to one or two sentences.';
export const NOTE_TOO_SHORT = 'Add a little more detail (at least 20 characters).';
export const NOTE_PICK_CATEGORY = 'Pick what you noticed above to send this.';
export const NOTE_UNCONFIRMED = "We couldn't confirm that was sent. Check the notes below before sending again.";
export const NOTE_ALREADY_WITHDRAWN = "This note was already withdrawn, so it wasn't sent again.";
export const NOTE_ALREADY_REMOVED = "This note was removed by Emblem staff, so it wasn't sent again.";
export const NOTE_NOT_LISTED = "This note isn't showing in the list below, so check there before writing it again.";
export const WITHDRAW_FAILED = "Couldn't withdraw that note. Try again.";

/** `category` undefined: not known here, so nothing is said about it. */
export function noteHint(check: ObservationCheck, category?: MySeasonCategoryKey | null): string {
  if (check.tooLong) return MY_SEASON_FORM_COPY.noteTooLong;
  if (check.tooManySentences) return NOTE_TOO_MANY_SENTENCES;
  if (check.length > 0 && check.tooShort) return NOTE_TOO_SHORT;
  if (check.valid && category === null) return NOTE_PICK_CATEGORY;
  return NOTE_SENTENCE_HINT;
}

/**
 * Text for the polite live region: changes only when the note crosses the
 * limit (empty under it), so a screen reader is not told every keystroke.
 */
export function noteLimitAnnouncement(check: ObservationCheck): string {
  return check.tooLong ? MY_SEASON_FORM_COPY.noteTooLong : '';
}

// ---------------------------------------------------------------------------
// Writes: request-id reuse and the double-submit guard
// ---------------------------------------------------------------------------

export const focusContentKey = (draft: FocusDraft): string =>
  JSON.stringify([draft.title.trim(), draft.whyItMatters.trim(), draft.whatItLooksLike.trim(), draft.startedOn]);

export const noteContentKey = (category: string | null, body: string): string => JSON.stringify([category, body.trim()]);

export type WriteController = {
  readonly busy: boolean;
  /** The id the next submit of `key` would use (same content after a failure: the same id). */
  peekRequestId: (key: string) => string | null;
  /**
   * Sends once. A call while one is in flight is ignored (resolves null).
   * A retry of the same content reuses the request id, so a lost response
   * never creates the row twice; changed content gets a new id. Success
   * forgets the id, and so does a request conflict: that id can never
   * succeed, so the next submit needs a new one.
   */
  submit: (key: string, send: (requestId: string) => Promise<WriteResult>) => Promise<WriteResult | null>;
};

export function createWriteController(makeId: () => string = newRequestId): WriteController {
  let inFlight = false;
  let last: { key: string; id: string } | null = null;
  return {
    get busy() {
      return inFlight;
    },
    peekRequestId: (key) => (last && last.key === key ? last.id : null),
    async submit(key, send) {
      if (inFlight) return null;
      inFlight = true;
      const id = last && last.key === key ? last.id : makeId();
      last = { key, id };
      try {
        const result = await send(id).catch((): WriteResult => ({ ok: false, error: GENERIC_SAVE_ERROR, unknown: true }));
        if (result.ok || result.code === 'request_conflict') last = null;
        return result;
      } finally {
        inFlight = false;
      }
    },
  };
}

export type WriteUi = { setBusy: (b: boolean) => void; setError: (e: string | null) => void; onDone: () => void; onFailed?: () => void };

/** One submit from an editor: busy on, send (once), busy off, then done or the error. */
export async function submitWrite(
  controller: WriteController,
  key: string,
  send: (requestId: string) => Promise<WriteResult>,
  ui: WriteUi
): Promise<'ignored' | 'ok' | 'failed'> {
  if (controller.busy) return 'ignored';
  ui.setBusy(true);
  ui.setError(null);
  const result = await controller.submit(key, send);
  if (result === null) return 'ignored';
  ui.setBusy(false);
  if (result.ok) {
    ui.onDone();
    return 'ok';
  }
  ui.setError(result.error);
  ui.onFailed?.();
  return 'failed';
}

// ---------------------------------------------------------------------------
// Sending a coach note: "Sent" is only said once the list proves it
// ---------------------------------------------------------------------------

export type NoteSentKind = 'sent' | 'already_withdrawn' | 'already_removed' | 'not_listed';

/**
 * What a send amounted to, judged from a list loaded after it.
 *  - The server gave an id: active in the list is sent; withdrawn means the
 *    key belonged to a note since withdrawn, or removed by staff (nothing new
 *    was created).
 *  - No usable answer: sent only if a note of mine with this exact content
 *    has appeared since the send started (`knownIds` were there before).
 *  - No list: nothing can be said.
 */
export function decideNoteOutcome(o: {
  result: AddNoteResult;
  view: MySeasonView | null;
  category: MySeasonCategoryKey;
  body: string;
  knownIds: readonly string[];
}): NoteSentKind | 'unconfirmed' {
  if (!o.view || !hasMySeasonContent(o.view)) return 'unconfirmed';
  const notes = o.view.observations;
  if (o.result.ok) {
    const id = o.result.observationId;
    const note = notes.find((n) => n.id === id);
    if (!note) return 'not_listed';
    if (!note.withdrawn) return 'sent';
    return note.removedByStaff ? 'already_removed' : 'already_withdrawn';
  }
  const appeared = notes.some((n) => !n.withdrawn && n.mine && !o.knownIds.includes(n.id) && n.category === o.category && n.body === o.body);
  return appeared ? 'sent' : 'unconfirmed';
}

/**
 * One send from the composer, including the reload that verifies it. The
 * whole thing runs inside the write controller, so a second click is ignored
 * until it finishes and the request id survives every unconfirmed outcome:
 * sending again cannot create a second note.
 */
export function sendNoteFlow(
  controller: WriteController,
  key: string,
  o: {
    post: (requestId: string) => Promise<AddNoteResult>;
    reloadNotes: () => Promise<MySeasonView | null>;
    category: MySeasonCategoryKey;
    body: string;
    knownIds: readonly string[];
  },
  ui: Omit<WriteUi, 'onDone'> & { onSent: (kind: NoteSentKind) => void }
): Promise<'ignored' | 'ok' | 'failed'> {
  let kind: NoteSentKind = 'sent';
  return submitWrite(
    controller,
    key,
    async (requestId) => {
      const result = await o.post(requestId);
      if (!result.ok && !result.unknown) return result;
      const view = await o.reloadNotes().catch(() => null);
      const outcome = decideNoteOutcome({ result, view, category: o.category, body: o.body, knownIds: o.knownIds });
      if (outcome === 'unconfirmed') return { ok: false, error: NOTE_UNCONFIRMED, unknown: true };
      kind = outcome;
      return { ok: true };
    },
    { setBusy: ui.setBusy, setError: ui.setError, onFailed: ui.onFailed, onDone: () => ui.onSent(kind) }
  );
}

// ---------------------------------------------------------------------------
// Family Home card: refresh it when a fresh load shows it is out of date
// ---------------------------------------------------------------------------

/** Everything Home's My Season card shows, as one comparable string. */
export function homeCardSignature(view: MySeasonView | null | undefined): string {
  if (!view) return 'none';
  if (!hasMySeasonContent(view)) return JSON.stringify(view);
  const latest = visibleFamilyObservations(view)[0] ?? null;
  return JSON.stringify([
    view.activeFocus?.id ?? null,
    view.activeFocus?.title ?? null,
    latest && [latest.id, latest.category, latest.body, latest.coachName, latest.createdAt],
  ]);
}

/** Refreshes Home. Resolving false means the refresh failed. */
export type HomeRefresh = () => void | Promise<boolean>;

export type HomeCardSync = {
  (home: MySeasonView | null | undefined, fresh: MySeasonView, refresh: HomeRefresh): void;
  /** The overlay is closing: if the last refresh failed (or fails later), try once more. */
  retryOnClose: (refresh: HomeRefresh) => void;
};

/**
 * Returns the function the overlay calls after each load. It refreshes Home
 * when the fresh view differs from what Home shows, once per distinct fresh
 * view: if the refreshed Home still differs (a race, or a failed refresh) it
 * does not ask again while the overlay is open, so this can never loop. A
 * failed refresh gets one more try when the overlay closes.
 */
export function createHomeCardSync(): HomeCardSync {
  let requestedFor: string | null = null;
  let latest = 0;
  let last: 'settled' | 'pending' | 'failed' = 'settled';
  let retryWhenFailed: HomeRefresh | null = null;

  const retryOnce = (refresh: HomeRefresh) => {
    last = 'settled';
    retryWhenFailed = null;
    try {
      void Promise.resolve(refresh()).catch(() => {});
    } catch {
      // Best effort: Home updates on its next load instead.
    }
  };

  const request = (refresh: HomeRefresh) => {
    const mine = ++latest;
    last = 'pending';
    const settle = (ok: unknown) => {
      if (mine !== latest) return;
      if (ok !== false) {
        last = 'settled';
        retryWhenFailed = null;
      } else if (retryWhenFailed) {
        retryOnce(retryWhenFailed);
      } else {
        last = 'failed';
      }
    };
    try {
      void Promise.resolve(refresh()).then(settle, () => settle(false));
    } catch {
      settle(false);
    }
  };

  const sync = ((home, fresh, refresh) => {
    const signature = homeCardSignature(fresh);
    if (signature === homeCardSignature(home)) {
      requestedFor = null;
      latest++;
      last = 'settled';
      retryWhenFailed = null;
      return;
    }
    if (signature === requestedFor) return;
    requestedFor = signature;
    request(refresh);
  }) as HomeCardSync;

  sync.retryOnClose = (refresh) => {
    if (last === 'failed') retryOnce(refresh);
    else if (last === 'pending') retryWhenFailed = refresh;
  };
  return sync;
}

/**
 * Who the open overlay is for. It loads its own data, so it stays open
 * whatever a Home refresh does to Home's view. Only a switch to a different
 * child ends it (null), and the caller then closes it properly.
 */
export type MySeasonOverlayPlayer = { playerId: string; playerName: string };

export function mySeasonOverlayPlayer(
  open: boolean,
  openedFor: MySeasonOverlayPlayer | null,
  currentPlayerId: string | null | undefined
): MySeasonOverlayPlayer | null {
  if (!open || !openedFor) return null;
  return currentPlayerId && currentPlayerId !== openedFor.playerId ? null : openedFor;
}

// ---------------------------------------------------------------------------
// Keyboard: Escape with unsaved changes, and the dialog's Tab trap
// ---------------------------------------------------------------------------

type KeyEventLike = { key: string; shiftKey?: boolean; preventDefault: () => void; stopPropagation: () => void };

/**
 * Escape inside an editor with unsaved changes is kept from reaching the
 * overlay (which would close and silently discard them). Returns true when
 * it was held back, so the editor can say why.
 */
export function holdEscapeIfDirty(e: KeyEventLike, dirty: boolean): boolean {
  if (e.key !== 'Escape' || !dirty) return false;
  e.stopPropagation();
  e.preventDefault();
  return true;
}

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Focusable = { focus: () => void };

/**
 * Tab / Shift+Tab inside a modal: wraps from the last control to the first
 * and back, and pulls focus in if it is outside. Returns the element to
 * focus (the caller focuses it), or null to let the browser move normally.
 */
export function trapTab<T extends Focusable>(e: KeyEventLike, items: T[], active: unknown): T | null {
  if (e.key !== 'Tab') return null;
  if (!items.length) {
    e.preventDefault();
    return null;
  }
  const i = items.indexOf(active as T);
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey) {
    if (i <= 0) {
      e.preventDefault();
      return last;
    }
    return null;
  }
  if (i === -1 || i === items.length - 1) {
    e.preventDefault();
    return first;
  }
  return null;
}

/** The My Season dialog's keydown: Escape closes, Tab stays inside. */
export function mySeasonDialogKeyDown(
  e: KeyEventLike,
  container: { querySelectorAll: (s: string) => ArrayLike<unknown> } | null | undefined,
  onClose: () => void,
  active: unknown = typeof document !== 'undefined' ? document.activeElement : null
): void {
  if (e.key === 'Escape') {
    onClose();
    return;
  }
  if (e.key !== 'Tab' || !container) return;
  const target = trapTab(e, Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) as Focusable[], active);
  target?.focus();
}

/**
 * Closing the overlay returns focus to the control that opened it, or to
 * `fallback` when a Home refresh has since removed that control.
 */
export function closeAndReturnFocus(
  setOpen: (open: boolean) => void,
  opener: { current: Focusable | null },
  fallback?: { current: Focusable | null }
): void {
  setOpen(false);
  (opener.current ?? fallback?.current)?.focus();
}

// ---------------------------------------------------------------------------
// Focus after a step unmounts (editor closed, note sent, withdraw done)
// ---------------------------------------------------------------------------

export const MS_IDS = {
  familyChangeFocus: 'ms-family-change-focus',
  coachChangeFocus: 'ms-coach-change-focus',
  coachAddNote: 'ms-coach-add-note',
  withdraw: (id: string) => `ms-withdraw-${id}`,
  withdrawPrompt: (id: string) => `ms-withdraw-prompt-${id}`,
  withdrawConfirm: (id: string) => `ms-withdraw-confirm-${id}`,
  withdrawn: (id: string) => `ms-withdrawn-${id}`,
  withdrawNotice: 'ms-withdraw-notice',
  /** Wraps the season section on the Card and coach screens: there whichever section shows. */
  seasonSection: 'season-section',
} as const;

/** Where focus should go next: the first of `ids` that exists. */
export type PendingFocus = { ids: string[] };

export function resolvePendingFocus(pending: PendingFocus, exists: (id: string) => boolean): string | null {
  return pending.ids.find(exists) ?? null;
}

/**
 * Focus through the withdraw steps. The warning, never the destructive
 * button, takes focus when the confirm step opens or a withdrawal fails, so
 * a repeated or held Enter cannot erase a note. After success focus goes to
 * the erased row, which exists as soon as the local erase has rendered.
 */
export const WITHDRAW_FOCUS = {
  ask: (id: string): PendingFocus => ({ ids: [MS_IDS.withdrawPrompt(id)] }),
  failed: (id: string): PendingFocus => ({ ids: [MS_IDS.withdrawPrompt(id)] }),
  cancel: (id: string): PendingFocus => ({ ids: [MS_IDS.withdraw(id)] }),
  done: (id: string): PendingFocus => ({ ids: [MS_IDS.withdrawn(id)] }),
  /** After a refusal's reload: only if the note's confirm step has gone. */
  refused: (): PendingFocus => ({ ids: [MS_IDS.withdrawNotice] }),
};

/**
 * Moves focus now, before the control being used unmounts. Used by the legacy
 * section's Retry, whose button disappears whatever the answer is.
 */
export function focusElementById(id: string): void {
  if (typeof document !== 'undefined') document.getElementById(id)?.focus();
}

/** Moves focus to the pending target after the render that set it (the target is in that same commit). */
export function usePendingFocus(): (p: PendingFocus | null) => void {
  const [pending, setPending] = useState<PendingFocus | null>(null);
  useEffect(() => {
    if (!pending) return;
    const focusId = resolvePendingFocus(pending, (id) => !!document.getElementById(id));
    if (focusId) document.getElementById(focusId)?.focus();
    setPending(null);
  }, [pending]);
  return setPending;
}
