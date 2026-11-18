import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} }) }));

import PlayerHome from './screens/PlayerHome';
import CardScreen from './screens/Card';
import MySeasonHomeCard from './screens/MySeasonHomeCard';
import MySeasonScreen, { MySeasonScreenView, type MySeasonLoadState } from './overlays/MySeasonScreen';
import { FocusEditor } from './mySeasonUi';
import { OsDataProvider } from './OsDataContext';
import { initialOsState } from './types';
import type { OsActions } from './OsApp';
import type { OsData } from './osData';
import { MS_PLAYER_ID, REAL_PARENT, buttonByText, expand, msContent, msNote, msWithdrawnNote } from './my-season-test-support';

const actions = new Proxy({}, { get: () => vi.fn() }) as unknown as OsActions;
const home = (data: OsData) => renderToStaticMarkup(<OsDataProvider value={data}><PlayerHome actions={actions} storyUpdates={[]} /></OsDataProvider>);
const card = (data: OsData) => renderToStaticMarkup(<OsDataProvider value={data}><CardScreen state={{ ...initialOsState, activated: true, flipped: true }} actions={actions} /></OsDataProvider>);

const screenView = (load: MySeasonLoadState, extra: { editing?: boolean; onRetry?: () => void } = {}) => (
  <MySeasonScreenView
    playerId={MS_PLAYER_ID}
    playerName="Riley Hart"
    load={load}
    editing={extra.editing ?? false}
    onClose={() => {}}
    onRetry={extra.onRetry ?? (() => {})}
    onStartEdit={() => {}}
    onCancelEdit={() => {}}
    onSaved={() => {}}
  />
);

describe('Home: My Season card (guardian, enabled)', () => {
  it('appears in This Season with the focus title, the latest coach note and an Open button', () => {
    const html = home({ ...REAL_PARENT, mySeason: msContent() });
    expect(html).toContain('data-testid="my-season-home-card"');
    expect(html).toContain('My Focus');
    expect(html).toContain('Talk more on the pitch');
    expect(html).toContain('Spoke up');
    expect(html).toContain('Called for the ball twice');
    expect(html).toContain('aria-label="Open My Season"');
    // The card sits after the This Season heading.
    expect(html.indexOf('This Season')).toBeLessThan(html.indexOf('my-season-home-card'));
  });

  it('empty focus and no notes', () => {
    const html = renderToStaticMarkup(<MySeasonHomeCard view={msContent({ activeFocus: null, observations: [] })} onOpen={() => {}} />);
    expect(html).toContain('No focus set yet');
    expect(html).toContain('No coach notes yet.');
  });

  it('never previews a withdrawn note', () => {
    const html = renderToStaticMarkup(<MySeasonHomeCard view={msContent({ observations: [msWithdrawnNote()] })} onOpen={() => {}} />);
    expect(html).not.toContain('Withdrawn');
    expect(html).toContain('No coach notes yet.');
  });

  it('Open calls onOpen', () => {
    const onOpen = vi.fn();
    const tree = expand(<MySeasonHomeCard view={msContent()} onOpen={onOpen} />);
    (buttonByText(tree, 'Open')!.props.onClick as () => void)();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is not shown for a coach-access or no-access view in the parent app; account review shows a paused line', () => {
    expect(home({ ...REAL_PARENT, mySeason: msContent({ access: 'coach' }) })).not.toContain('my-season-home-card');
    const paused = home({ ...REAL_PARENT, mySeason: { enabled: true, access: 'none', reason: 'account_review' } });
    expect(paused).not.toContain('my-season-home-card');
    expect(paused).toContain('My Season is paused while your account is being reviewed.');
  });

  it('Card back hides the legacy Season Focus only when My Season is enabled', () => {
    expect(card({ ...REAL_PARENT, mySeason: null })).toContain('SEASON FOCUS');
    expect(card({ ...REAL_PARENT, mySeason: msContent() })).not.toContain('SEASON FOCUS');
  });
});

describe('MySeasonScreen (family overlay)', () => {
  it('ready: context line, My Focus in the child voice, notes since this focus, coach notes, earlier focus, privacy', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent() }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Back to Home"');
    expect(html).toContain("You&#x27;re looking at Riley&#x27;s season on your family account. Riley can read it with you.");
    expect(html).toContain('My Focus');
    expect(html).toContain('Why it matters');
    expect(html).toContain('What it looks like');
    expect(html).toContain('Since 6 Sept 2026');
    expect(html).toContain('Agreed with Coach Danny');
    expect(html).toContain('Notes since this focus');
    expect(html).toContain('What your coach noticed');
    expect(html).toContain('Coach Danny · 15 Nov 2026');
    expect(html).toContain('Earlier focus');
    expect(html).toContain('Keep my head up');
    expect(html).toContain('Apr 2026 to Aug 2026');
    expect(html).toContain('Private to your family and Riley&#x27;s team coaches. Nothing here is public.');
    expect(html).toContain('>Change focus<');
    // Notes since this focus excludes the August note (before the 6 Sept start).
    const since = html.slice(html.indexOf('Notes since this focus'), html.indexOf('What your coach noticed'));
    expect(since).toContain('Called for the ball twice');
    expect(since).not.toContain('3-0 down');
  });

  it('a guardian-set focus reads "Set by a parent"; a deleted coach reads "A former coach"', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent({ activeFocus: { ...msContent().activeFocus!, authorRole: 'guardian' }, observations: [msNote({ coachName: null, formerCoach: true })] }) }));
    expect(html).toContain('Set by a parent');
    expect(html).toContain('A former coach');
  });

  it('empty focus and no notes', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent({ activeFocus: null, observations: [], earlierFocuses: [] }) }));
    expect(html).toContain('No focus set yet');
    expect(html).toContain('>Set a focus<');
    expect(html).toContain('No notes yet. When Riley&#x27;s coach notices something, it will appear here.');
    expect(html).not.toContain('Earlier focus');
  });

  it('no Change focus button when canEditFocus is false', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent({ canEditFocus: false }) }));
    expect(html).not.toContain('>Change focus<');
  });

  it('withdrawn notes are never shown to the family', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent({ observations: [msWithdrawnNote()] }) }));
    expect(html).not.toContain('Withdrawn');
    expect(html).toContain('No notes yet.');
  });

  it('loading shows a skeleton (context line stays visible)', () => {
    const html = renderToStaticMarkup(screenView({ status: 'loading', view: null }));
    expect(html).toContain('data-testid="my-season-skeleton"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Riley can read it with you.');
  });

  it('error shows the message and a Retry button that retries', () => {
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(screenView({ status: 'error', view: null }, { onRetry }));
    expect(html).toContain('Couldn&#x27;t load My Season. Check your connection and try again.');
    const tree = expand(screenView({ status: 'error', view: null }, { onRetry }));
    (buttonByText(tree, 'Retry')!.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the container opens in the loading state and fetches nothing during server render', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const html = renderToStaticMarkup(<MySeasonScreen playerId={MS_PLAYER_ID} playerName="Riley Hart" onClose={() => {}} onChanged={() => {}} />);
    expect(html).toContain('data-testid="my-season-skeleton"');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('editing shows the Change focus form with labelled fields', () => {
    const html = renderToStaticMarkup(screenView({ status: 'ready', view: msContent() }, { editing: true }));
    expect(html).toContain('aria-label="Change focus"');
    for (const label of ['My focus', 'Why it matters', 'What it looks like', 'Start date']) expect(html).toContain(`>${label}</label>`);
    expect(html).toContain('maxLength="60"');
  });

  it('replacing an active focus asks for confirmation first', () => {
    const html = renderToStaticMarkup(
      <FocusEditor
        playerId={MS_PLAYER_ID}
        firstName="Riley"
        hasActiveFocus
        onSaved={() => {}}
        onCancel={() => {}}
        initialStep="confirm"
        initialDraft={{ title: 'Use my left foot', whyItMatters: 'So I can pass both ways.', whatItLooksLike: 'Left-foot passes in games.', startedOn: '2026-11-18' }}
      />
    );
    expect(html).toContain('This replaces the current focus. The old one stays in Earlier focus.');
    expect(html).toContain('>Replace focus<');
    expect(html).toContain('>Go back<');
  });
});
