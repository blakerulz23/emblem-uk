import { describe, expect, it } from 'vitest';
import {
  MY_SEASON_CATEGORIES,
  MY_SEASON_ERRORS,
  checkObservationBody,
  countSentences,
  enabledViewOrNull,
  focusAuthorLine,
  focusDraftProblems,
  isMySeasonCategory,
  isValidFocusStart,
  mySeasonErrorFor,
  notesSinceFocus,
  observationAuthor,
  parseMySeasonView,
  validateFocusInput,
  validateObservationInput,
  type MySeasonFocus,
  type MySeasonObservation,
} from './my-season';

const PLAYER = '30000000-0000-4000-8000-000000000001';
const REQ = '40000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-18T12:00:00Z');

const focus = (o: Partial<MySeasonFocus> = {}): MySeasonFocus => ({
  id: 'f1', title: 'Talk more on the pitch', whyItMatters: 'So my teammates know where I am.', whatItLooksLike: 'Calling for the ball.',
  startedOn: '2026-09-06', endedAt: null, authorRole: 'coach', authorName: 'Coach Danny', ...o,
});
const obs = (o: Partial<MySeasonObservation> = {}): MySeasonObservation => ({
  id: 'o1', category: 'spoke_up', body: 'Called for the ball twice in the second half.', createdAt: '2026-11-15T10:00:00Z',
  coachName: 'Coach Danny', formerCoach: false, mine: false, withdrawn: false, ...o,
});

describe('categories', () => {
  it('are exactly the six agreed keys, in order, with labels, emoji and hints', () => {
    expect(MY_SEASON_CATEGORIES.map((c) => c.key)).toEqual([
      'lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger',
    ]);
    expect(MY_SEASON_CATEGORIES.map((c) => c.label)).toEqual([
      'Lifted the team', 'Kept going', 'Tried something new', 'Helped someone belong', 'Spoke up', 'Came back stronger',
    ]);
    for (const c of MY_SEASON_CATEGORIES) {
      expect(c.emoji).toBeTruthy();
      expect(c.hint).toBeTruthy();
    }
    expect(isMySeasonCategory('spoke_up')).toBe(true);
    expect(isMySeasonCategory('Spoke up')).toBe(false);
    expect(isMySeasonCategory(null)).toBe(false);
  });
});

describe('observation body (mirrors the DB: trimmed, 20-160 chars, at most two sentences)', () => {
  it('counts sentence-ending runs followed by whitespace or the end', () => {
    expect(countSentences('Great game')).toBe(0);
    expect(countSentences('Great game.')).toBe(1);
    expect(countSentences('Great game!! Really.')).toBe(2);
    expect(countSentences('Ran 3.5 km today and kept going')).toBe(0);
    expect(countSentences('One. Two. Three.')).toBe(3);
    expect(countSentences('Really?! Yes.')).toBe(2);
  });

  it('applies the length bounds after trimming, counting code points', () => {
    expect(checkObservationBody('  ' + 'a'.repeat(19) + '  ').tooShort).toBe(true);
    expect(checkObservationBody('a'.repeat(20)).valid).toBe(true);
    expect(checkObservationBody('a'.repeat(160)).valid).toBe(true);
    expect(checkObservationBody('a'.repeat(161)).tooLong).toBe(true);
    // An emoji is one character to Postgres (char_length), two UTF-16 units to JS.
    expect(checkObservationBody('💪'.repeat(20)).length).toBe(20);
  });

  it('refuses three sentences', () => {
    const c = checkObservationBody('Kept going all game. Never stopped running. Brilliant.');
    expect(c.tooManySentences).toBe(true);
    expect(c.valid).toBe(false);
  });

  it('validateObservationInput needs UUIDs, a known category and a valid body', () => {
    const ok = { playerId: PLAYER, category: 'kept_going', body: '  Chased every ball in the last minute.  ', requestId: REQ };
    expect(validateObservationInput(ok)).toEqual({ ok: true, value: { ...ok, body: 'Chased every ball in the last minute.' } });
    expect(validateObservationInput({ ...ok, playerId: 'riley' }).ok).toBe(false);
    expect(validateObservationInput({ ...ok, requestId: 'x' }).ok).toBe(false);
    expect(validateObservationInput({ ...ok, category: 'best_player' }).ok).toBe(false);
    expect(validateObservationInput({ ...ok, body: 'Too short.' }).ok).toBe(false);
    expect(validateObservationInput({ ...ok, body: 42 }).ok).toBe(false);
    expect(validateObservationInput(null).ok).toBe(false);
  });
});

describe('focus input', () => {
  const draft = { title: 'Talk more', whyItMatters: 'So I am heard', whatItLooksLike: 'Calling out', startedOn: '2026-11-18' };

  it('accepts a valid draft and trims', () => {
    const r = validateFocusInput({ ...draft, title: '  Talk more  ', playerId: PLAYER, requestId: REQ }, NOW);
    expect(r).toEqual({ ok: true, value: { ...draft, playerId: PLAYER, requestId: REQ } });
  });

  it('title 3-60, why/looks 3-160', () => {
    expect(focusDraftProblems({ ...draft, title: 'ab' }, NOW)).toEqual(['title']);
    expect(focusDraftProblems({ ...draft, title: 'a'.repeat(61) }, NOW)).toEqual(['title']);
    expect(focusDraftProblems({ ...draft, title: 'a'.repeat(60) }, NOW)).toEqual([]);
    expect(focusDraftProblems({ ...draft, whyItMatters: '  a ' }, NOW)).toEqual(['whyItMatters']);
    expect(focusDraftProblems({ ...draft, whatItLooksLike: 'a'.repeat(161) }, NOW)).toEqual(['whatItLooksLike']);
  });

  it('start date: a real date, not before 2000-01-01, not more than one day ahead', () => {
    expect(isValidFocusStart('2026-11-19', NOW)).toBe(true);
    expect(isValidFocusStart('2026-11-20', NOW)).toBe(false);
    expect(isValidFocusStart('2000-01-01', NOW)).toBe(true);
    expect(isValidFocusStart('1999-12-31', NOW)).toBe(false);
    expect(isValidFocusStart('2026-02-30', NOW)).toBe(false);
    expect(isValidFocusStart('18/11/2026', NOW)).toBe(false);
  });

  it('rejects missing ids and non-strings', () => {
    expect(validateFocusInput({ ...draft, playerId: PLAYER }, NOW).ok).toBe(false);
    expect(validateFocusInput({ ...draft, title: 5, playerId: PLAYER, requestId: REQ }, NOW).ok).toBe(false);
  });
});

describe('parseMySeasonView', () => {
  const content = {
    enabled: true, access: 'guardian', canEditFocus: true, canAddNote: false,
    activeFocus: focus(), earlierFocuses: [focus({ id: 'f0', endedAt: '2026-09-06T00:00:00Z' })], observations: [obs()],
  };

  it('accepts the three contract shapes', () => {
    expect(parseMySeasonView({ enabled: false })).toEqual({ enabled: false });
    expect(parseMySeasonView({ enabled: true, access: 'none', reason: 'former_coach' })).toEqual({ enabled: true, access: 'none', reason: 'former_coach' });
    expect(parseMySeasonView(content)).toEqual(content);
    expect(parseMySeasonView({ ...content, activeFocus: null })).toMatchObject({ activeFocus: null });
  });

  it('drops extra fields and refuses anything outside the contract', () => {
    expect(parseMySeasonView({ enabled: true, access: 'none', reason: 'private_coach', activeFocus: focus() })).toEqual({ enabled: true, access: 'none', reason: 'private_coach' });
    for (const bad of [null, [], 'x', { enabled: 'true' }, { enabled: true, access: 'none', reason: 'other' }, { ...content, access: 'staff' },
      { ...content, canAddNote: 'yes' }, { ...content, observations: [{ ...obs(), category: 'top_player' }] }, { ...content, activeFocus: { id: 1 } }]) {
      expect(parseMySeasonView(bad)).toBeNull();
    }
  });

  it('enabledViewOrNull keeps only enabled views', () => {
    expect(enabledViewOrNull({ enabled: false })).toBeNull();
    expect(enabledViewOrNull(null)).toBeNull();
    expect(enabledViewOrNull({ enabled: true, access: 'none', reason: 'account_review' })).toEqual({ enabled: true, access: 'none', reason: 'account_review' });
  });
});

describe('EMS error mapping', () => {
  it('maps every EMS code to a fixed status and never passes the DB message through', () => {
    const cases: [string, number, string][] = [
      ['EMS01', 401, 'sign_in_required'], ['EMS02', 404, 'not_available'], ['EMS03', 403, 'not_allowed'], ['EMS04', 403, 'account_review'],
      ['EMS05', 400, 'invalid_input'], ['EMS06', 409, 'request_conflict'], ['EMS07', 403, 'own_child'], ['EMS08', 500, 'failed'],
      ['EMS09', 500, 'failed'], ['42883', 500, 'failed'], ['PGRST202', 500, 'failed'],
    ];
    for (const [sqlstate, status, code] of cases) {
      const e = mySeasonErrorFor({ code: sqlstate, message: 'player Riley Hart guardian@example.com' } as { code: string });
      expect(e.status).toBe(status);
      expect(e.code).toBe(code);
      expect(e.message).not.toMatch(/Riley|example\.com/);
    }
    expect(mySeasonErrorFor(null)).toBe(MY_SEASON_ERRORS.failed);
  });
});

describe('display helpers', () => {
  it('author lines', () => {
    expect(focusAuthorLine(focus())).toBe('Agreed with Coach Danny');
    expect(focusAuthorLine(focus({ authorName: null }))).toBe('Agreed with a former coach');
    expect(focusAuthorLine(focus({ authorRole: 'guardian', authorName: 'Sam' }))).toBe('Set by a parent');
    expect(observationAuthor(obs())).toBe('Coach Danny');
    expect(observationAuthor(obs({ coachName: null, formerCoach: true }))).toBe('A former coach');
  });

  it('notes since this focus: created on/after the start date, withdrawn excluded', () => {
    const list = [obs({ id: 'a', createdAt: '2026-09-07T09:00:00' }), obs({ id: 'b', createdAt: '2026-09-01T09:00:00' }), obs({ id: 'c', createdAt: '2026-10-01T09:00:00', withdrawn: true })];
    expect(notesSinceFocus(list, focus()).map((o) => o.id)).toEqual(['a']);
  });
});
