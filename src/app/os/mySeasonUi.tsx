'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import {
  FOCUS_EARLIEST_START,
  FOCUS_TEXT_MAX,
  FOCUS_TITLE_MAX,
  OBSERVATION_MAX,
  checkObservationBody,
  focusDraftProblems,
  formatMySeasonDate,
  formatMySeasonMonth,
  focusAuthorLine,
  mySeasonCategory,
  observationAuthor,
  MY_SEASON_CATEGORIES,
  type FocusDraft,
  type FocusField,
  type MySeasonCategoryKey,
  type MySeasonFocus,
  type MySeasonObservation,
} from '@/lib/my-season';
import { MY_SEASON_LOAD_ERROR, MY_SEASON_SESSION_ENDED, addMySeasonObservation, saveMySeasonFocus, todayLocalIso } from './mySeasonClient';
import {
  MY_SEASON_FORM_COPY,
  NOTE_SENTENCE_HINT,
  NOTE_TOO_MANY_SENTENCES,
  NOTE_TOO_SHORT,
  createWriteController,
  focusContentKey,
  focusDraftDirty,
  focusFieldMessages,
  focusStartMax,
  focusSubmitAction,
  holdEscapeIfDirty,
  noteContentKey,
  noteDirty,
  noteHint,
  noteLimitAnnouncement,
  submitWrite,
  type WriteController,
} from './mySeasonFlows';

/**
 * Shared My Season building blocks for the family overlay and the coach
 * player screen. Presentational pieces take every bit of state as props
 * (no hooks) so tests can render each state directly; the two small
 * editors (FocusEditor, NoteComposer) keep their own form state.
 */

// ---------------------------------------------------------------------------
// Copy (customer-visible; no em dashes, no ranking language)
// ---------------------------------------------------------------------------

export const MY_SEASON_COPY = {
  familyContext: (first: string) => `You're looking at ${first}'s season on your family account. ${first} can read it with you.`,
  familyPrivacy: (first: string) => `Private to your family and ${first}'s team coaches. Nothing here is public.`,
  noFocus: 'No focus set yet',
  noFocusFamilyBody: (first: string) => `Pick one thing ${first} wants to work on this season, in ${first}'s own words.`,
  noNotesFamily: (first: string) => `No notes yet. When ${first}'s coach notices something, it will appear here.`,
  noNotesSinceFocus: 'No notes since this focus started yet.',
  replaceConfirm: 'This replaces the current focus. The old one stays in Earlier focus.',
  coachPrivacy: (first: string) =>
    `${first}'s family will see this with your name. It is never public and never compared with teammates. You can withdraw it later.`,
  sentToast: (first: string) => `Sent. ${first}'s family can see it in My Season.`,
  withdrawnNote: 'Withdrawn. The family no longer sees this.',
  withdrawConfirm: 'Withdraw this note? The family will no longer see it.',
  ownChild: "You can't add notes for your own child. Another coach on the team can.",
  privateCoach: (first: string) =>
    `My Season notes are only for coaches on ${first}'s team. You're connected to ${first} directly, so you can't add notes or change the focus.`,
  formerCoach: (first: string) =>
    `You can't add notes for ${first} any more. Only coaches currently on ${first}'s team can add notes or change the focus.`,
  accountReview: 'My Season is paused while your account is being reviewed.',
  sentenceHint: NOTE_SENTENCE_HINT,
  tooManySentences: NOTE_TOO_MANY_SENTENCES,
  tooShort: NOTE_TOO_SHORT,
  loadError: MY_SEASON_LOAD_ERROR,
  sessionEnded: MY_SEASON_SESSION_ENDED,
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const msEyebrow: CSSProperties = {
  fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.12em', fontSize: 12.5, textTransform: 'uppercase', margin: 0,
};
export const msCard: CSSProperties = {
  background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 20px -16px rgba(0,0,0,.2)', border: '1px solid var(--os-border)',
};
export const msButton: CSSProperties = {
  minHeight: 44, borderRadius: 999, padding: '10px 18px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14.5, cursor: 'pointer',
};
/** Long unbroken words (or pasted links) wrap instead of overflowing the card. */
export const msWrap: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 };
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
const fieldLabelStyle: CSSProperties = { ...msEyebrow, fontSize: 12, display: 'block', marginBottom: 6 };
const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12, border: '1.5px solid var(--os-border)',
  fontFamily: 'Roboto', fontSize: 16, background: 'var(--os-card)', color: 'var(--os-ink)',
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

export function MsButton({
  children, onClick, variant = 'primary', disabled, ariaLabel, type = 'button', style, id, buttonRef,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; ariaLabel?: string; type?: 'button' | 'submit'; style?: CSSProperties;
  id?: string; buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`os-ms-focus ${variant === 'primary' ? 'os-ms-primary' : 'os-ms-ghost'}`}
      style={{ ...msButton, ...style }}
    >
      {children}
    </button>
  );
}

export function PrivacyLine({ text, icon = '🔒' }: { text: string; icon?: string }) {
  return (
    <p className="os-ms-soft" style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.45, margin: 0 }}>
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </p>
  );
}

export function MySeasonSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 12 }} data-testid="my-season-skeleton">
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Loading My Season</span>
      <div className="os-ms-skeleton" style={{ height: 18, width: '40%' }} />
      <div className="os-ms-skeleton" style={{ height: 96 }} />
      <div className="os-ms-skeleton" style={{ height: 18, width: '55%' }} />
      <div className="os-ms-skeleton" style={{ height: 72 }} />
    </div>
  );
}

/** A failed load. `signedOut` (a 401): the session ended, so no Retry. */
export function MySeasonError({ onRetry, busy, signedOut = false }: { onRetry: () => void; busy?: boolean; signedOut?: boolean }) {
  return (
    <div role="alert" style={{ ...msCard, display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14.5, color: 'var(--os-ink)' }}>{signedOut ? MY_SEASON_COPY.sessionEnded : MY_SEASON_COPY.loadError}</p>
      {!signedOut && <MsButton variant="ghost" onClick={onRetry} disabled={busy} style={{ justifySelf: 'start' }}>Retry</MsButton>}
    </div>
  );
}

export function NoteRow({ note, children }: { note: MySeasonObservation; children?: ReactNode }) {
  const cat = mySeasonCategory(note.category);
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 12, listStyle: 'none', opacity: note.withdrawn ? 0.7 : 1 }}>
      <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(233,116,53,.12)', fontSize: 20 }}>
        {cat?.emoji}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 15, color: 'var(--os-ink)' }}>{cat?.label}</div>
        <q style={{ display: 'block', margin: '2px 0 6px', fontSize: 15, lineHeight: 1.45, color: 'var(--os-ink)', ...msWrap }}>{note.body}</q>
        <div className="os-ms-soft" style={{ fontSize: 13 }}>
          {observationAuthor(note)} · {formatMySeasonDate(note.createdAt)}
        </div>
        {children}
      </div>
    </li>
  );
}

export function NoteList({ notes, empty, renderExtra }: { notes: MySeasonObservation[]; empty: string; renderExtra?: (n: MySeasonObservation) => ReactNode }) {
  if (!notes.length) return <p className="os-ms-soft" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 14 }}>
      {notes.map((n) => (
        <NoteRow key={n.id} note={n}>{renderExtra?.(n)}</NoteRow>
      ))}
    </ul>
  );
}

export function FocusSummary({ focus }: { focus: MySeasonFocus }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'Roboto', fontWeight: 800, fontSize: 19, lineHeight: 1.2, color: 'var(--os-ink)', ...msWrap }}>{focus.title}</h3>
        <div className="os-ms-soft" style={{ fontSize: 13, marginTop: 3 }}>
          Since {formatMySeasonDate(focus.startedOn)} · {focusAuthorLine(focus)}
        </div>
      </div>
      <div>
        <h4 className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12 }}>Why it matters</h4>
        <p style={{ margin: '3px 0 0', fontSize: 15, lineHeight: 1.45, color: 'var(--os-ink)', ...msWrap }}>{focus.whyItMatters}</p>
      </div>
      <div>
        <h4 className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12 }}>What it looks like</h4>
        <p style={{ margin: '3px 0 0', fontSize: 15, lineHeight: 1.45, color: 'var(--os-ink)', ...msWrap }}>{focus.whatItLooksLike}</p>
      </div>
    </div>
  );
}

export function EarlierFocusList({ focuses }: { focuses: MySeasonFocus[] }) {
  if (!focuses.length) return null;
  return (
    <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {focuses.map((f) => (
        <li key={f.id} style={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: 'var(--os-ink)' }}>
          <span style={msWrap}>{f.title}</span>
          <span className="os-ms-soft" style={{ whiteSpace: 'nowrap' }}>
            {formatMySeasonMonth(f.startedOn)}{f.endedAt ? ` to ${formatMySeasonMonth(f.endedAt)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Change focus form (guardian on the family screen; team coach on the coach screen)
// ---------------------------------------------------------------------------

export type FocusEditorStep = 'edit' | 'confirm';

export function emptyFocusDraft(now: Date = new Date()): FocusDraft {
  return { title: '', whyItMatters: '', whatItLooksLike: '', startedOn: todayLocalIso(now) };
}

export function FocusEditor({
  playerId,
  firstName,
  hasActiveFocus,
  onSaved,
  onCancel,
  initialDraft,
  initialStep = 'edit',
}: {
  playerId: string;
  firstName: string;
  hasActiveFocus: boolean;
  onSaved: () => void;
  onCancel: () => void;
  initialDraft?: FocusDraft;
  initialStep?: FocusEditorStep;
}) {
  const [initial] = useState<FocusDraft>(() => initialDraft ?? emptyFocusDraft());
  const [draft, setDraft] = useState<FocusDraft>(initial);
  const [step, setStep] = useState<FocusEditorStep>(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escapeHeld, setEscapeHeld] = useState(false);
  // Idempotency: a retry of the same content reuses the request id (the
  // server never creates the focus twice); edited content gets a new one.
  // The controller also drops a second submit while one is in flight.
  const controller = useRef<WriteController | null>(null);
  if (!controller.current) controller.current = createWriteController();
  const titleRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const prevStep = useRef<FocusEditorStep | null>(null);

  // Focus follows the step: the first field on open, the confirm prompt
  // when it replaces the form, the Save button after Go back.
  useEffect(() => {
    const prev = prevStep.current;
    prevStep.current = step;
    if (prev === step) return;
    if (step === 'confirm') promptRef.current?.focus();
    else (prev === null ? titleRef : saveRef).current?.focus();
  }, [step]);

  const problems = focusDraftProblems(draft);
  const valid = problems.length === 0;
  const dirty = focusDraftDirty(initial, draft);
  const set = (k: keyof FocusDraft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    setError(null);
    setEscapeHeld(false);
  };

  const save = () =>
    submitWrite(controller.current!, focusContentKey(draft), (requestId) => saveMySeasonFocus(playerId, draft, requestId), {
      setBusy,
      setError,
      onDone: onSaved,
      // The busy button was disabled; put focus back on the control to retry.
      onFailed: () => setTimeout(() => (step === 'confirm' ? replaceRef : saveRef).current?.focus(), 0),
    });

  const submit = () => {
    const action = focusSubmitAction({ valid, busy, hasActiveFocus, step });
    if (action === 'confirm') setStep('confirm');
    else if (action === 'save') void save();
  };

  const onKeyDown = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
    if (holdEscapeIfDirty(e, dirty && !busy)) setEscapeHeld(true);
  };
  const escapeNotice = (
    <p role="status" className="os-ms-soft" style={{ margin: 0, fontSize: 13.5 }}>{escapeHeld ? MY_SEASON_FORM_COPY.unsavedEscape : ''}</p>
  );

  const id = `ms-focus-${playerId.slice(0, 8)}`;

  if (step === 'confirm') {
    return (
      <div style={{ display: 'grid', gap: 12 }} data-testid="focus-replace-confirm" onKeyDown={onKeyDown}>
        <p ref={promptRef} tabIndex={-1} id={`${id}-confirm`} style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.replaceConfirm}</p>
        {error && <p role="alert" className="os-ms-error" style={{ margin: 0, fontSize: 13.5 }}>{error}</p>}
        {escapeNotice}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <MsButton buttonRef={replaceRef} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Replace focus'}</MsButton>
          <MsButton variant="ghost" onClick={() => setStep('edit')} disabled={busy}>Go back</MsButton>
        </div>
      </div>
    );
  }

  const messages = focusFieldMessages(draft);
  const field = (k: FocusField) => ({
    'aria-describedby': `${id}-${k}-msg`,
    'aria-invalid': messages[k].invalid,
  });
  const message = (k: FocusField) => (
    <p id={`${id}-${k}-msg`} className={messages[k].invalid ? 'os-ms-error' : 'os-ms-soft'} style={{ margin: '4px 0 0', fontSize: 12.5 }}>
      {messages[k].text}
    </p>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={onKeyDown}
      style={{ display: 'grid', gap: 12 }}
      aria-label="Change focus"
    >
      <p className="os-ms-soft" style={{ margin: 0, fontSize: 13.5 }}>Write it the way {firstName} would say it.</p>
      <div>
        <label htmlFor={`${id}-title`} className="os-ms-soft" style={fieldLabelStyle}>My focus</label>
        <input ref={titleRef} id={`${id}-title`} className="os-ms-focus" value={draft.title} onChange={set('title')} maxLength={FOCUS_TITLE_MAX} placeholder="e.g. Talk more on the pitch" style={inputStyle} {...field('title')} />
        {message('title')}
      </div>
      <div>
        <label htmlFor={`${id}-why`} className="os-ms-soft" style={fieldLabelStyle}>Why it matters</label>
        <textarea id={`${id}-why`} className="os-ms-focus" value={draft.whyItMatters} onChange={set('whyItMatters')} maxLength={FOCUS_TEXT_MAX} rows={2} placeholder="e.g. So my teammates know where I am." style={{ ...inputStyle, resize: 'vertical' }} {...field('whyItMatters')} />
        {message('whyItMatters')}
      </div>
      <div>
        <label htmlFor={`${id}-looks`} className="os-ms-soft" style={fieldLabelStyle}>What it looks like</label>
        <textarea id={`${id}-looks`} className="os-ms-focus" value={draft.whatItLooksLike} onChange={set('whatItLooksLike')} maxLength={FOCUS_TEXT_MAX} rows={2} placeholder="e.g. Calling for the ball in every game." style={{ ...inputStyle, resize: 'vertical' }} {...field('whatItLooksLike')} />
        {message('whatItLooksLike')}
      </div>
      <div>
        <label htmlFor={`${id}-start`} className="os-ms-soft" style={fieldLabelStyle}>Start date</label>
        <input id={`${id}-start`} className="os-ms-focus" type="date" value={draft.startedOn} onChange={set('startedOn')} min={FOCUS_EARLIEST_START} max={focusStartMax()} style={inputStyle} {...field('startedOn')} />
        {message('startedOn')}
      </div>
      {error && <p role="alert" className="os-ms-error" style={{ margin: 0, fontSize: 13.5 }}>{error}</p>}
      {escapeNotice}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <MsButton buttonRef={saveRef} type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save focus'}</MsButton>
        <MsButton variant="ghost" onClick={onCancel} disabled={busy}>Cancel</MsButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Coach "Add a note" composer
// ---------------------------------------------------------------------------

export function NoteComposer({
  playerId,
  firstName,
  onSent,
  onCancel,
  initialCategory = null,
  initialBody = '',
}: {
  playerId: string;
  firstName: string;
  onSent: () => void;
  onCancel: () => void;
  initialCategory?: MySeasonCategoryKey | null;
  initialBody?: string;
}) {
  const [category, setCategory] = useState<MySeasonCategoryKey | null>(initialCategory);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escapeHeld, setEscapeHeld] = useState(false);
  // Same request id for a retry of the same note; a new one once edited.
  const controller = useRef<WriteController | null>(null);
  if (!controller.current) controller.current = createWriteController();
  const firstCategoryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstCategoryRef.current?.focus();
  }, []);

  const send = async () => {
    if (!category || !checkObservationBody(body).valid) return;
    await submitWrite(controller.current!, noteContentKey(category, body), (requestId) => addMySeasonObservation(playerId, category, body, requestId), {
      setBusy,
      setError,
      onDone: onSent,
    });
  };
  const dirty = noteDirty({ category: initialCategory, body: initialBody }, { category, body });

  return (
    <NoteComposerView
      playerId={playerId}
      firstName={firstName}
      category={category}
      body={body}
      busy={busy}
      error={error}
      onCategory={(c) => {
        setCategory(c);
        setError(null);
        setEscapeHeld(false);
      }}
      onBody={(v) => {
        setBody(v);
        setError(null);
        setEscapeHeld(false);
      }}
      onSend={() => void send()}
      onCancel={onCancel}
      escapeHeld={escapeHeld}
      onKeyDown={(e) => {
        if (holdEscapeIfDirty(e, dirty && !busy)) setEscapeHeld(true);
      }}
      firstCategoryRef={firstCategoryRef}
    />
  );
}

export function NoteComposerView({
  playerId, firstName, category, body, busy, error, onCategory, onBody, onSend, onCancel, escapeHeld = false, onKeyDown, firstCategoryRef,
}: {
  playerId: string; firstName: string; category: MySeasonCategoryKey | null; body: string; busy: boolean; error: string | null;
  onCategory: (c: MySeasonCategoryKey) => void; onBody: (v: string) => void; onSend: () => void; onCancel: () => void;
  escapeHeld?: boolean;
  onKeyDown?: (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void;
  firstCategoryRef?: Ref<HTMLButtonElement>;
}) {
  const check = checkObservationBody(body);
  const canSend = !!category && check.valid && !busy;
  const id = `ms-note-${playerId.slice(0, 8)}`;
  const hint = noteHint(check);
  const hintIsError = check.tooLong || check.tooManySentences;
  return (
    <section aria-labelledby={`${id}-h`} style={{ display: 'grid', gap: 10 }} onKeyDown={onKeyDown}>
      <h4 id={`${id}-h`} className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12.5 }}>What did you notice?</h4>
      <div role="group" aria-label="Pick what you noticed" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {MY_SEASON_CATEGORIES.map((c, i) => {
          const on = category === c.key;
          return (
            <button
              key={c.key}
              ref={i === 0 ? firstCategoryRef : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => onCategory(c.key)}
              className="os-ms-focus"
              style={{
                display: 'grid', gridTemplateColumns: '26px 1fr', gap: 8, alignItems: 'center', textAlign: 'left', minHeight: 56,
                border: `1.5px solid ${on ? '#B34715' : 'var(--os-border)'}`, background: on ? 'rgba(233,116,53,.12)' : 'var(--os-card)',
                color: 'var(--os-ink)', borderRadius: 12, padding: '8px 10px', fontFamily: 'Roboto', fontWeight: 600, fontSize: 13.5, lineHeight: 1.2, cursor: 'pointer',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 18 }}>{c.emoji}</span>
              <span>
                {c.label}
                <small className="os-ms-soft" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2 }}>{c.hint}</small>
              </span>
            </button>
          );
        })}
      </div>
      <label htmlFor={`${id}-body`} className="os-ms-soft" style={{ ...fieldLabelStyle, marginTop: 4 }}>What happened (one or two sentences)</label>
      <textarea
        id={`${id}-body`}
        className="os-ms-focus"
        value={body}
        onChange={(e) => onBody(e.target.value)}
        maxLength={OBSERVATION_MAX + 40}
        rows={3}
        aria-describedby={`${id}-count ${id}-hint`}
        aria-invalid={check.length > 0 && !check.valid}
        style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
        <span id={`${id}-hint`} className={hintIsError ? 'os-ms-error' : 'os-ms-soft'}>{hint}</span>
        {/* Visual counter only: not live, so typing is not read out. */}
        <span
          id={`${id}-count`}
          className={check.tooLong ? 'os-ms-error' : 'os-ms-soft'}
          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: check.tooLong ? 700 : 400, whiteSpace: 'nowrap' }}
        >
          {check.length} / {OBSERVATION_MAX}
        </span>
      </div>
      {/* Announces only when the note goes over (or back under) the limit. */}
      <span role="status" aria-live="polite" data-testid="note-limit-live" style={srOnly}>{noteLimitAnnouncement(check)}</span>
      <p role="status" className="os-ms-soft" style={{ margin: 0, fontSize: 13.5 }}>{escapeHeld ? MY_SEASON_FORM_COPY.unsavedEscape : ''}</p>
      <PrivacyLine text={MY_SEASON_COPY.coachPrivacy(firstName)} />
      {error && <p role="alert" className="os-ms-error" style={{ margin: 0, fontSize: 13.5 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <MsButton onClick={onSend} disabled={!canSend}>{busy ? 'Sending…' : `Send to ${firstName}'s family`}</MsButton>
        <MsButton variant="ghost" onClick={onCancel} disabled={busy}>Cancel</MsButton>
      </div>
    </section>
  );
}
