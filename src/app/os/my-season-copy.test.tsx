import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { MY_SEASON_CATEGORIES, MY_SEASON_ERRORS, type MySeasonView } from '@/lib/my-season';
import { MY_SEASON_COPY, NoteComposerView, FocusEditor } from './mySeasonUi';
import { MY_SEASON_LOAD_ERROR, MY_SEASON_SESSION_ENDED, GENERIC_SAVE_ERROR } from './mySeasonClient';
import { MY_SEASON_FORM_COPY } from './mySeasonFlows';
import { MySeasonScreenView } from './overlays/MySeasonScreen';
import MySeasonHomeCard from './screens/MySeasonHomeCard';
import { CoachMySeasonPanel, INITIAL_COACH_PANEL_UI } from './screens/CoachMySeasonSection';
import { MS_PLAYER_ID, msContent, msNote, msWithdrawnNote } from './my-season-test-support';

/**
 * Copy rules for every customer-visible My Season string: no em dashes and
 * no ranking/comparison language. The single approved exception is the
 * coach privacy line's promise that notes are "never compared with
 * teammates" (design section 4), which is checked explicitly.
 */

const RANKING = /\b(rank|ranks|ranked|ranking|rankings|score|scores|scored|scoring|best|top|compare|compares|compared|comparison|leaderboard)\b/i;
const APPROVED = "It is never public and never compared with teammates.";

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const attrs = (html: string) => Array.from(html.matchAll(/(?:aria-label|placeholder|title)="([^"]*)"/g)).map((m) => m[1]);

function allRendered(): string[] {
  const out: string[] = [];
  const add = (node: ReactElement) => {
    const html = renderToStaticMarkup(node);
    out.push(text(html), ...attrs(html));
  };
  for (const load of [
    { status: 'ready', view: msContent() },
    { status: 'ready', view: msContent({ activeFocus: null, observations: [], earlierFocuses: [] }) },
    { status: 'ready', view: { enabled: true, access: 'none', reason: 'account_review' } },
    { status: 'loading', view: null },
    { status: 'error', view: null },
  ] as const) {
    for (const editing of [false, true]) {
      add(<MySeasonScreenView playerId={MS_PLAYER_ID} playerName="Riley Hart" load={load as never} editing={editing} onClose={noop} onRetry={noop} onStartEdit={noop} onCancelEdit={noop} onSaved={noop} />);
    }
  }
  add(<MySeasonHomeCard view={msContent()} onOpen={noop} />);
  add(<MySeasonHomeCard view={msContent({ activeFocus: null, observations: [] })} onOpen={noop} />);
  add(<FocusEditor playerId={MS_PLAYER_ID} firstName="Riley" hasActiveFocus onSaved={noop} onCancel={noop} initialStep="confirm" />);
  const views: MySeasonView[] = [
    msContent({ access: 'coach', canAddNote: true, observations: [msNote({ mine: true }), msWithdrawnNote({ id: 'o2' })] }),
    msContent({ access: 'guardian', canAddNote: false }),
    { enabled: true, access: 'none', reason: 'private_coach' },
    { enabled: true, access: 'none', reason: 'former_coach' },
    { enabled: true, access: 'none', reason: 'account_review' },
  ];
  for (const view of views) {
    for (const ui of [INITIAL_COACH_PANEL_UI, { ...INITIAL_COACH_PANEL_UI, confirmingWithdrawId: 'o1', toast: MY_SEASON_COPY.sentToast('Riley') }]) {
      for (const status of ['ready', 'error'] as const) {
        add(
          <CoachMySeasonPanel playerId={MS_PLAYER_ID} firstName="Riley" state={{ status, view }} ui={ui} onRetry={noop} reloadNotes={async () => null} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop} onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop} />
        );
      }
    }
  }
  for (const body of ['', 'Short one', 'One thing here. Two things here. Three things.', 'Chased every ball in the last minute.']) {
    add(<NoteComposerView playerId={MS_PLAYER_ID} firstName="Riley" category="kept_going" body={body} busy={false} error="Something went wrong. Try again." onCategory={noop} onBody={noop} onSend={noop} onCancel={noop} />);
  }
  return out;
}

function allConstants(): string[] {
  const copy = Object.values(MY_SEASON_COPY).map((v) => (typeof v === 'function' ? (v as (n: string) => string)('Riley') : v));
  return [
    ...copy,
    ...Object.values(MY_SEASON_ERRORS).map((e) => e.message),
    ...MY_SEASON_CATEGORIES.flatMap((c) => [c.label, c.hint]),
    MY_SEASON_LOAD_ERROR,
    MY_SEASON_SESSION_ENDED,
    GENERIC_SAVE_ERROR,
    ...Object.values(MY_SEASON_FORM_COPY).map((v) => (typeof v === 'function' ? (v as (n: number) => string)(3) : v)),
  ];
}

describe('My Season copy', () => {
  const strings = [...allRendered(), ...allConstants()];

  it('has no em dashes', () => {
    for (const s of strings) expect(s, s).not.toContain('—');
  });

  it('has no ranking, scoring or comparison language (apart from the approved privacy promise)', () => {
    for (const s of strings) expect(s.replace(APPROVED, ''), s).not.toMatch(RANKING);
    expect(strings.some((s) => s.includes(APPROVED))).toBe(true);
  });

  it('speaks in the child voice for the focus and keeps the parent context line', () => {
    const joined = strings.join('\n');
    expect(joined).toContain('My Focus');
    expect(joined).toContain("You're looking at Riley's season on your family account. Riley can read it with you.");
  });

  it('the withdraw confirmation says the deletion is permanent', () => {
    expect(MY_SEASON_COPY.withdrawConfirm).toBe('Withdraw this note? The family will no longer see it, and the text will be permanently deleted.');
    expect(strings.join('\n')).toContain(MY_SEASON_COPY.withdrawConfirm);
  });

  it('new My Season source files contain no em dashes at all', () => {
    for (const f of [
      'src/lib/my-season.ts',
      'src/lib/my-season-api.ts',
      'src/app/os/mySeasonUi.tsx',
      'src/app/os/mySeasonClient.ts',
      'src/app/os/mySeasonFlows.ts',
      'src/app/os/overlays/MySeasonScreen.tsx',
      'src/app/os/screens/MySeasonHomeCard.tsx',
      'src/app/os/screens/CoachMySeasonSection.tsx',
      'src/app/api/os/my-season/route.ts',
      'src/app/api/os/my-season/focus/route.ts',
      'src/app/api/os/my-season/observations/route.ts',
      'src/app/api/os/my-season/observations/[id]/withdraw/route.ts',
    ]) {
      const source = readFileSync(f, 'utf8');
      expect(source, f).not.toContain('—');
      // Request bodies and RPC errors can hold a child's note: nothing here logs.
      expect(source, f).not.toMatch(/\bconsole\./);
    }
  });
});
