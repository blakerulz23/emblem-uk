export type RecognitionPayload = { playerId: string; award: string; message: string };

/**
 * POSTs a coach recognition and reports whether the server actually saved
 * it. Only a 2xx response carrying a momentId counts as saved — a network
 * error, a non-2xx status or an unreadable body is a failure, so the UI
 * never shows "Recognition added" for something that isn't in the family's
 * Collection.
 */
export async function submitRecognition(fetchImpl: typeof fetch, payload: RecognitionPayload): Promise<'saved' | 'failed'> {
  try {
    const res = await fetchImpl('/api/os/celebrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return 'failed';
    const data = (await res.json().catch(() => null)) as { ok?: unknown; momentId?: unknown } | null;
    return data?.ok === true && typeof data.momentId === 'string' ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}

/** The slice of OsState the Celebrate sheet's send reads and writes. */
export type RecognitionSheetState = {
  celeb: string | null;
  award: string | null;
  coachMsg: string;
  celebSending: boolean;
  celebError: boolean;
  sent: boolean;
};

type RecognitionPatch = Partial<RecognitionSheetState> | ((s: RecognitionSheetState) => Partial<RecognitionSheetState>);

export type RecognitionSendDeps = {
  /** Demo/fixture mode: squad ids aren't players.id values, so nothing is saved and the celebration is instant. */
  isDemo: boolean;
  submit: (payload: RecognitionPayload) => Promise<'saved' | 'failed'>;
  patch: (p: RecognitionPatch) => void;
  /**
   * Synchronous in-flight guard. React state (celebSending) only updates on
   * the next render, so two taps in the same frame would both pass a
   * state-only check and send twice; this ref closes that gap.
   */
  inFlight: { current: boolean };
  /** Starts the "Recognition added" toast's hide timer. */
  onSent: () => void;
  /** Real accounts only, after a confirmed save (e.g. router.refresh()). */
  onSaved?: () => void;
};

/**
 * "Send Recognition" in the coach's Celebrate sheet. Real accounts only
 * show "Recognition added" once the server has confirmed the save; a
 * failure keeps the sheet open with the coach's award and message so a
 * retry sends the identical recognition, which the celebrate route
 * deduplicates if the first attempt did in fact save.
 */
export async function sendRecognitionFlow(
  state: RecognitionSheetState,
  deps: RecognitionSendDeps
): Promise<'blocked' | 'demo' | 'saved' | 'failed'> {
  if (!state.award || !state.celeb || state.celebSending || deps.inFlight.current) return 'blocked';
  if (deps.isDemo) {
    deps.patch({ celeb: null, award: null, coachMsg: '', sent: true });
    deps.onSent();
    return 'demo';
  }
  const playerId = state.celeb;
  deps.inFlight.current = true;
  deps.patch({ celebSending: true, celebError: false });
  let result: 'saved' | 'failed';
  try {
    result = await deps.submit({ playerId, award: state.award, message: state.coachMsg });
  } catch {
    result = 'failed';
  } finally {
    deps.inFlight.current = false;
  }
  if (result === 'saved') {
    // Close the sheet only if it's still this player's — the coach may
    // have closed it, or opened another player, while it was sending.
    deps.patch((s) => (s.celeb === playerId ? { celeb: null, award: null, coachMsg: '', celebSending: false, sent: true } : { celebSending: false, sent: true }));
    deps.onSent();
    deps.onSaved?.();
  } else {
    deps.patch((s) => ({ celebSending: false, celebError: s.celeb === playerId }));
  }
  return result;
}
