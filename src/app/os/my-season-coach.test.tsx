import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MY_SEASON_CATEGORIES, type MySeasonView } from '@/lib/my-season';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} }) }));

// CoachPlayerDetail's hook is replaced so a test can say what the server
// answered; everything else in the module is the real code.
const hook = vi.hoisted(() => ({ state: { status: 'idle', view: null } as { status: 'idle' | 'loading' | 'ready' | 'error'; view: MySeasonView | null; knownEnabled?: boolean }, args: [] as unknown[] }));
vi.mock('@/app/os/screens/CoachMySeasonSection', async (importOriginal) => {
  const real = await importOriginal<typeof import('./screens/CoachMySeasonSection')>();
  return {
    ...real,
    useCoachMySeason: (a: unknown) => {
      hook.args.push(a);
      return { state: hook.state, reload: async () => null, eraseWithdrawn: () => {}, enabled: real.coachMySeasonEnabled(hook.state), lookup: real.coachLookupStatus(true, hook.state) };
    },
  };
});

import CoachPlayerDetail from './screens/CoachPlayerDetail';
import { CoachMySeasonPanel, INITIAL_COACH_PANEL_UI, withdrawFlow, type CoachMySeasonState, type CoachPanelUi } from './screens/CoachMySeasonSection';
import { NoteComposerView } from './mySeasonUi';
import { OsDataProvider } from './OsDataContext';
import { DEMO_OS_DATA, type OsData } from './osData';
import type { OsActions } from './OsApp';
import { MS_PLAYER_ID, MS_TEAM_ID, buttonByText, expand, findAll, msContent, msNote, msWithdrawnNote } from './my-season-test-support';

const actions = new Proxy({}, { get: () => vi.fn() }) as unknown as OsActions;
const squadPlayer = { ...DEMO_OS_DATA.squad[0], id: MS_PLAYER_ID, name: 'Riley Hart', teamId: MS_TEAM_ID, seasonFocus: [] };
const REAL_COACH: OsData = {
  ...DEMO_OS_DATA,
  mode: 'real',
  squad: [squadPlayer],
  verifyQueue: [],
  coachTeamsManaged: [{ id: MS_TEAM_ID, name: 'U10 Blues', playerCount: 1 }] as OsData['coachTeamsManaged'],
  mySeasonCoachLookup: true,
};
const detail = (data: OsData = REAL_COACH) => renderToStaticMarkup(<OsDataProvider value={data}><CoachPlayerDetail playerId={MS_PLAYER_ID} actions={actions} /></OsDataProvider>);

const noop = () => {};
function panel(state: CoachMySeasonState, ui: Partial<CoachPanelUi> = {}, handlers: Partial<Record<string, (...a: never[]) => void>> = {}) {
  return (
    <CoachMySeasonPanel
      playerId={MS_PLAYER_ID}
      firstName="Riley"
      state={state}
      ui={{ ...INITIAL_COACH_PANEL_UI, ...ui }}
      onRetry={noop}
      reloadNotes={async () => null}
      onStartEditFocus={noop}
      onCancelEditFocus={noop}
      onFocusSaved={noop}
      onOpenComposer={noop}
      onCancelComposer={noop}
      onNoteSent={noop}
      onAskWithdraw={noop}
      onCancelWithdraw={noop}
      onConfirmWithdraw={noop}
      {...handlers}
    />
  );
}
const ready = (view: MySeasonView): CoachMySeasonState => ({ status: 'ready', view });
const coachView = (o = {}) => msContent({ access: 'coach', canEditFocus: true, canAddNote: true, ...o });

beforeEach(() => {
  hook.state = { status: 'idle', view: null };
  hook.args = [];
});

describe('CoachPlayerDetail with My Season', () => {
  it('passes the lookup flag, real mode and the team id to the hook (one request per opened player)', () => {
    detail();
    expect(hook.args[0]).toEqual({ playerId: MS_PLAYER_ID, isReal: true, lookup: true, teamId: MS_TEAM_ID });
  });

  it('keeps the legacy Season Focus section while the answer is unknown or not enabled', () => {
    for (const state of [{ status: 'idle', view: null }, { status: 'loading', view: null }, { status: 'error', view: null }, { status: 'ready', view: { enabled: false } }] as const) {
      hook.state = state as typeof hook.state;
      const html = detail();
      expect(html).toContain('Season Focus');
      expect(html).not.toContain('data-testid="coach-my-season"');
    }
  });

  it('enabled but unusable: the error with Retry, and the legacy section stays hidden', () => {
    hook.state = { status: 'error', view: null, knownEnabled: true };
    const html = detail();
    expect(html).toContain('data-testid="coach-my-season"');
    expect(html).toContain('>Retry<');
    expect(html).not.toContain('Season Focus <span');
  });

  it('hides the legacy section and shows My Season once enabled', () => {
    hook.state = { status: 'ready', view: coachView() };
    const html = detail();
    expect(html).toContain('data-testid="coach-my-season"');
    expect(html).not.toContain('Season Focus <span');
    expect(html).not.toContain('3/3 active');
  });
});

describe('Coach My Season panel', () => {
  it('current team coach: focus summary, Change focus and Add a note, own notes can be withdrawn', () => {
    const view = coachView({ observations: [msNote({ mine: true }), msNote({ id: 'o2', coachName: 'Coach Amy' })] });
    const html = renderToStaticMarkup(panel(ready(view)));
    expect(html).toContain('Riley&#x27;s focus');
    expect(html).toContain('Talk more on the pitch');
    expect(html).toContain('>Change focus<');
    expect(html).toContain('>Add a note<');
    expect(html).not.toContain('own child');
    // Only the coach's own note has Withdraw.
    expect(html.match(/>Withdraw</g)).toHaveLength(1);
  });

  it('own child (parent-coach): can change the focus, composer replaced by the explanation', () => {
    const html = renderToStaticMarkup(panel(ready(msContent({ access: 'guardian', canEditFocus: true, canAddNote: false }))));
    expect(html).toContain('>Change focus<');
    expect(html).not.toContain('>Add a note<');
    expect(html).toContain('You can&#x27;t add notes for your own child. Another coach on the team can.');
  });

  it.each([
    ['private_coach', "My Season notes are only for coaches on Riley&#x27;s team. You&#x27;re connected to Riley directly, so you can&#x27;t add notes or change the focus."],
    ['former_coach', 'You can&#x27;t add notes for Riley any more. Only coaches currently on Riley&#x27;s team can add notes or change the focus.'],
    ['account_review', 'My Season is paused while your account is being reviewed.'],
  ] as const)('%s: explanation only, no content and no actions', (reason, text) => {
    const html = renderToStaticMarkup(panel(ready({ enabled: true, access: 'none', reason })));
    expect(html).toContain(text);
    expect(html).not.toContain('Talk more on the pitch');
    expect(html).not.toContain('<button');
  });

  it('not enabled: renders nothing', () => {
    expect(renderToStaticMarkup(panel(ready({ enabled: false })))).toBe('');
    expect(renderToStaticMarkup(panel({ status: 'loading', view: null }))).toBe('');
  });

  it('error after a reload shows Retry, which retries', () => {
    const onRetry = vi.fn();
    const state: CoachMySeasonState = { status: 'error', view: coachView() };
    expect(renderToStaticMarkup(panel(state))).toContain('Couldn&#x27;t load My Season');
    const tree = expand(panel(state, {}, { onRetry }));
    (buttonByText(tree, 'Retry')!.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalled();
  });

  it('no focus and no notes', () => {
    const html = renderToStaticMarkup(panel(ready(coachView({ activeFocus: null, observations: [] }))));
    expect(html).toContain('No focus set yet');
    expect(html).toContain('>Set a focus<');
    expect(html).toContain('No notes yet.');
  });

  it('withdrawn note: only the status line for the author, no content, no Withdraw button', () => {
    const html = renderToStaticMarkup(panel(ready(coachView({ observations: [msWithdrawnNote()] }))));
    expect(html).toContain('Withdrawn. The family no longer sees this.');
    expect(html).not.toContain('>Withdraw<');
    expect(html).not.toContain('<q');
    for (const c of MY_SEASON_CATEGORIES) expect(html).not.toContain(c.label);
    expect(html).not.toContain('Coach Danny ·');
  });

  it('withdraw asks inside the UI first (no window.confirm), then confirms or keeps', () => {
    const onAskWithdraw = vi.fn();
    const onConfirmWithdraw = vi.fn();
    const onCancelWithdraw = vi.fn();
    const view = coachView({ observations: [msNote({ mine: true })] });
    let tree = expand(panel(ready(view), {}, { onAskWithdraw }));
    (buttonByText(tree, 'Withdraw')!.props.onClick as () => void)();
    expect(onAskWithdraw).toHaveBeenCalledWith('o1');

    const html = renderToStaticMarkup(panel(ready(view), { confirmingWithdrawId: 'o1' }));
    expect(html).toContain('Withdraw this note? The family will no longer see it, and the text will be permanently deleted.');
    tree = expand(panel(ready(view), { confirmingWithdrawId: 'o1' }, { onConfirmWithdraw, onCancelWithdraw }));
    (buttonByText(tree, 'Withdraw note')!.props.onClick as () => void)();
    expect(onConfirmWithdraw).toHaveBeenCalledWith('o1');
    (buttonByText(tree, 'Keep it')!.props.onClick as () => void)();
    expect(onCancelWithdraw).toHaveBeenCalled();
  });

  it('withdrawFlow: success erases the text locally, clears the confirm and reloads; failure keeps it with an error', async () => {
    const ui: Partial<CoachPanelUi>[] = [];
    const reload = vi.fn();
    const erase = vi.fn();
    const focusNext = vi.fn();
    expect(await withdrawFlow('o1', { setUi: (p) => ui.push(p), withdraw: async () => ({ ok: true }), erase, reload, focusNext })).toBe(true);
    expect(ui.at(-1)).toMatchObject({ withdrawBusy: false, confirmingWithdrawId: null });
    expect(erase).toHaveBeenCalledWith('o1');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(erase.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);

    ui.length = 0;
    reload.mockClear();
    erase.mockClear();
    expect(await withdrawFlow('o1', { setUi: (p) => ui.push(p), withdraw: async () => ({ ok: false, error: "You can't make this change for this player." }), erase, reload, focusNext })).toBe(false);
    expect(ui.at(-1)).toEqual({ withdrawBusy: false, withdrawError: "You can't make this change for this player." });
    expect(reload).not.toHaveBeenCalled();
    expect(await withdrawFlow('o1', { setUi: (p) => ui.push(p), withdraw: () => Promise.reject(new Error('offline')), erase, reload, focusNext })).toBe(false);
    expect(erase).not.toHaveBeenCalled();
  });

  it('success toast is announced politely', () => {
    const html = renderToStaticMarkup(panel(ready(coachView()), { toast: "Sent. Riley's family can see it in My Season." }));
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Sent. Riley&#x27;s family can see it in My Season.');
  });
});

describe('Add a note composer', () => {
  const composer = (category: string | null, body: string, onSend = vi.fn()) => (
    <NoteComposerView playerId={MS_PLAYER_ID} firstName="Riley" category={category as never} body={body} busy={false} error={null} onCategory={noop} onBody={noop} onSend={onSend} onCancel={noop} />
  );
  const sendButton = (tree: unknown) => buttonByText(tree, "Send to Riley's family")!;

  it('six categories as toggle buttons, labelled textarea, live counter, sentence hint and privacy line', () => {
    const html = renderToStaticMarkup(composer(null, ''));
    expect(html.match(/aria-pressed=/g)).toHaveLength(6);
    for (const label of ['Lifted the team', 'Kept going', 'Tried something new', 'Helped someone belong', 'Spoke up', 'Came back stronger']) expect(html).toContain(label);
    expect(html).toMatch(/<label for="ms-note-30000000-body"[^>]*>What happened \(one or two sentences\)<\/label>/);
    expect(html).toContain('id="ms-note-30000000-body"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('0 / 160');
    expect(html).toContain('One or two sentences about what you saw.');
    expect(html).toContain('Riley&#x27;s family will see this with your name. It is never public and never compared with teammates. You can withdraw it later.');
  });

  it('Send is disabled until a category is picked and the note is valid', () => {
    const valid = 'Chased every ball in the last minute.';
    expect(sendButton(expand(composer(null, valid))).props.disabled).toBe(true);
    expect(sendButton(expand(composer('kept_going', 'Too short.'))).props.disabled).toBe(true);
    expect(sendButton(expand(composer('kept_going', 'One thing here. Two things here. Three things.'))).props.disabled).toBe(true);
    expect(sendButton(expand(composer('kept_going', 'a'.repeat(161)))).props.disabled).toBe(true);
    const onSend = vi.fn();
    const ok = sendButton(expand(composer('kept_going', valid, onSend)));
    expect(ok.props.disabled).toBe(false);
    (ok.props.onClick as () => void)();
    expect(onSend).toHaveBeenCalled();
  });

  it('counter and hint react to the text', () => {
    expect(renderToStaticMarkup(composer('kept_going', 'Chased every ball in the last minute.'))).toContain('37 / 160');
    const three = renderToStaticMarkup(composer('kept_going', 'One thing here. Two things here. Three things.'));
    expect(three).toContain('Keep it to one or two sentences.');
    const long = expand(composer('kept_going', 'a'.repeat(170)));
    const counter = findAll(long, (el) => el.props?.id === 'ms-note-30000000-count')[0];
    expect(counter.props.className).toBe('os-ms-error');
    expect(renderToStaticMarkup(composer('kept_going', 'Short one'))).toContain('Add a little more detail (at least 20 characters).');
  });

  it('the picked category is pressed', () => {
    const tree = expand(composer('spoke_up', ''));
    const pressed = findAll(tree, (el) => el.type === 'button' && el.props['aria-pressed'] === true);
    expect(pressed).toHaveLength(1);
  });
});
