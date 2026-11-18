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
  isIsoDate,
  isoDateUtc,
  type FocusDraft,
  type FocusField,
  type ObservationCheck,
} from '@/lib/my-season';
import { newRequestId, todayLocalIso, type WriteResult } from './mySeasonClient';

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

export function noteHint(check: ObservationCheck): string {
  if (check.tooLong) return MY_SEASON_FORM_COPY.noteTooLong;
  if (check.tooManySentences) return NOTE_TOO_MANY_SENTENCES;
  if (check.length > 0 && check.tooShort) return NOTE_TOO_SHORT;
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
   * forgets the id.
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
        const result = await send(id).catch((): WriteResult => ({ ok: false, error: "Couldn't save that. Check your connection and try again." }));
        if (result.ok) last = null;
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

/** Closing the overlay returns focus to the control that opened it. */
export function closeAndReturnFocus(setOpen: (open: boolean) => void, opener: { current: Focusable | null }): void {
  setOpen(false);
  opener.current?.focus();
}

// ---------------------------------------------------------------------------
// Focus after a step unmounts (editor closed, note sent, withdraw done)
// ---------------------------------------------------------------------------

export const MS_IDS = {
  familyChangeFocus: 'ms-family-change-focus',
  coachChangeFocus: 'ms-coach-change-focus',
  coachAddNote: 'ms-coach-add-note',
  withdraw: (id: string) => `ms-withdraw-${id}`,
  withdrawConfirm: (id: string) => `ms-withdraw-confirm-${id}`,
  withdrawn: (id: string) => `ms-withdrawn-${id}`,
} as const;

/** Where focus should go next: the first of `ids` that exists. */
export type PendingFocus = { ids: string[]; waitWhileLoading?: boolean };

export function resolvePendingFocus(
  pending: PendingFocus,
  loading: boolean,
  exists: (id: string) => boolean
): { focusId: string | null; done: boolean } {
  if (pending.waitWhileLoading && loading) return { focusId: null, done: false };
  return { focusId: pending.ids.find(exists) ?? null, done: true };
}

/**
 * Moves focus to the pending target after the render that set it (the
 * target is in that same commit), or, for waitWhileLoading, after the
 * render where loading ends.
 */
export function usePendingFocus(loading: boolean): (p: PendingFocus | null) => void {
  const [pending, setPending] = useState<PendingFocus | null>(null);
  useEffect(() => {
    if (!pending) return;
    const r = resolvePendingFocus(pending, loading, (id) => !!document.getElementById(id));
    if (r.focusId) document.getElementById(r.focusId)?.focus();
    if (r.done) setPending(null);
  }, [pending, loading]);
  return setPending;
}
