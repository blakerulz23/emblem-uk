import { describe, expect, it } from 'vitest';
import { createPlayer, defaultOrder, type OrderDraft, type PlayerDraft } from './emblem-uk-builder';
import type { PricingQuoteResponse } from './pricing-quote';
import type { OrderPricingQuoteState } from './pricing-quote-controller';
import {
  buildCoachCardPayload,
  coachCardDesignInheritance,
  coachCardTeamOptions,
  emptyCoachCardDraft,
  evaluateCoachCardEligibility,
  isCoachCardDraftComplete,
  reconcileCoachCardTeamSelection,
  selectCoachCardTeam,
  validateCoachCardDraft,
  type CoachCardDraft,
} from './coach-card-draft';

function approvedPlayer(overrides: Partial<PlayerDraft> = {}): PlayerDraft {
  const approvedAt = '2026-01-01T00:00:00.000Z';
  return createPlayer({
    name: 'Player',
    position: 'ST',
    kitNo: '9',
    photo: { srcUrl: 'blob:photo', crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false },
    approvedAt,
    updatedAt: approvedAt,
    prints: 1,
    ...overrides,
  });
}

function orderWith(players: PlayerDraft[], overrides: Partial<OrderDraft> = {}): OrderDraft {
  return { ...defaultOrder(), players, ...overrides };
}

function quoteLine(overrides: Partial<PricingQuoteResponse['lineItems'][number]> = {}) {
  return { kind: 'coach_card' as const, quantity: 1, unitPricePence: 0, subtotalPence: 0, ...overrides };
}

function readyQuote(overrides: Partial<PricingQuoteResponse> = {}): OrderPricingQuoteState {
  return {
    status: 'ready',
    quote: {
      currency: 'GBP',
      pricingTier: 'squad',
      paidPlayerCount: 10,
      totalPrintQuantity: 10,
      unitPricePence: 1899,
      subtotalPence: 18990,
      pricingVersion: 1,
      coachCardIncluded: true,
      lineItems: [
        { kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 },
        quoteLine(),
      ],
      deliveryPence: null,
      taxPence: null,
      totalPence: null,
      ...overrides,
    },
  };
}

describe('evaluateCoachCardEligibility', () => {
  it('idle/loading/error quotes are never eligible', () => {
    expect(evaluateCoachCardEligibility({ status: 'idle' }, 10, 10).eligible).toBe(false);
    expect(evaluateCoachCardEligibility({ status: 'loading' }, 10, 10).eligible).toBe(false);
    expect(evaluateCoachCardEligibility({ status: 'error', message: 'x' }, 10, 10).eligible).toBe(false);
  });

  it('a ready quote whose counts no longer match current counts is stale, not eligible', () => {
    const state = readyQuote();
    const result = evaluateCoachCardEligibility(state, 9, 9);
    expect(result).toEqual({ eligible: false, reason: 'quote-not-fresh' });
  });

  it('a fresh Multi (non-squad) quote is not eligible even if somehow coachCardIncluded were true', () => {
    const state = readyQuote({ paidPlayerCount: 5, totalPrintQuantity: 5, coachCardIncluded: false, lineItems: [{ kind: 'player_card', quantity: 5, unitPricePence: 2199, subtotalPence: 10995 }] });
    const result = evaluateCoachCardEligibility(state, 5, 5);
    expect(result).toEqual({ eligible: false, reason: 'not-unlocked' });
  });

  it('a fresh Single quote is not eligible', () => {
    const state = readyQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, pricingTier: 'single', coachCardIncluded: false, lineItems: [{ kind: 'player_card', quantity: 1, unitPricePence: 2499, subtotalPence: 2499 }] });
    const result = evaluateCoachCardEligibility(state, 1, 1);
    expect(result.eligible).toBe(false);
  });

  it('a fresh Squad quote with exactly one valid £0 coach_card line is eligible', () => {
    const state = readyQuote();
    const result = evaluateCoachCardEligibility(state, 10, 10);
    expect(result).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('missing coach_card line despite coachCardIncluded=true rejects eligibility', () => {
    const state = readyQuote({ lineItems: [{ kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 }] });
    const result = evaluateCoachCardEligibility(state, 10, 10);
    expect(result).toEqual({ eligible: false, reason: 'invalid-coach-line' });
  });

  it('duplicate coach_card lines reject eligibility', () => {
    const state = readyQuote({ lineItems: [{ kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 }, quoteLine(), quoteLine()] });
    expect(evaluateCoachCardEligibility(state, 10, 10)).toEqual({ eligible: false, reason: 'invalid-coach-line' });
  });

  it('a coach_card line with the wrong quantity rejects eligibility', () => {
    const state = readyQuote({ lineItems: [{ kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 }, quoteLine({ quantity: 2 })] });
    expect(evaluateCoachCardEligibility(state, 10, 10)).toEqual({ eligible: false, reason: 'invalid-coach-line' });
  });

  it('a coach_card line with a non-zero price rejects eligibility', () => {
    const state = readyQuote({ lineItems: [{ kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 }, quoteLine({ unitPricePence: 100, subtotalPence: 100 })] });
    expect(evaluateCoachCardEligibility(state, 10, 10)).toEqual({ eligible: false, reason: 'invalid-coach-line' });
  });
});

describe('coachCardTeamOptions', () => {
  it('a single-club Custom Collection order yields exactly one option', () => {
    const order = orderWith(
      [approvedPlayer({ id: 'p1', club: 'Sunday League FC' }), approvedPlayer({ id: 'p2', club: 'Sunday League FC' })],
      { club: 'Sunday League FC' },
    );
    const options = coachCardTeamOptions(order);
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({ id: expect.any(String), clubName: 'Sunday League FC', teamName: 'Sunday League FC' });
  });

  it('a Custom Collection order with two distinct player-level club names yields two options', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', club: 'Team A' }),
      approvedPlayer({ id: 'p2', club: 'Team B' }),
    ]);
    const options = coachCardTeamOptions(order);
    expect(options.map((o) => o.clubName).sort()).toEqual(['Team A', 'Team B']);
  });

  it('excludes unapproved players from the available options', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', club: 'Approved FC' }),
      createPlayer({ id: 'p2', name: 'Not approved', club: 'Unapproved FC' }),
    ]);
    const options = coachCardTeamOptions(order);
    expect(options).toHaveLength(1);
    expect(options[0].clubName).toBe('Approved FC');
  });

  it('Official Collection groups by emjflClubId, distinct player.club text does not fragment the group', () => {
    const order = orderWith(
      [
        approvedPlayer({ id: 'p1', club: 'Hollinwood Juniors', emjflClubId: 'hollinwood' }),
        approvedPlayer({ id: 'p2', club: 'Hollinwood Juniors', emjflClubId: 'hollinwood' }),
      ],
      { collectionType: 'official', emjflClubId: 'hollinwood', club: 'Hollinwood Juniors' },
    );
    expect(coachCardTeamOptions(order)).toHaveLength(1);
  });
});

describe('reconcileCoachCardTeamSelection', () => {
  it('auto-preselects the only available option when nothing is selected', () => {
    const options = [{ id: 'a', clubName: 'Club A', teamName: 'Club A' }];
    const draft = reconcileCoachCardTeamSelection(emptyCoachCardDraft(), options);
    expect(draft.teamOptionId).toBe('a');
    expect(draft.clubName).toBe('Club A');
    expect(draft.teamName).toBe('Club A');
  });

  it('does not auto-select when multiple options exist', () => {
    const options = [
      { id: 'a', clubName: 'Club A', teamName: 'Club A' },
      { id: 'b', clubName: 'Club B', teamName: 'Club B' },
    ];
    const draft = reconcileCoachCardTeamSelection(emptyCoachCardDraft(), options);
    expect(draft.teamOptionId).toBeNull();
  });

  it('leaves a still-valid explicit selection untouched', () => {
    const options = [
      { id: 'a', clubName: 'Club A', teamName: 'Club A' },
      { id: 'b', clubName: 'Club B', teamName: 'Club B' },
    ];
    const selected = selectCoachCardTeam(emptyCoachCardDraft(), options[1]);
    const reconciled = reconcileCoachCardTeamSelection(selected, options);
    expect(reconciled).toEqual(selected);
  });

  it('clears a selection whose option no longer exists (team removed), when more than one option remains', () => {
    const selected = selectCoachCardTeam(emptyCoachCardDraft(), { id: 'gone', clubName: 'Gone FC', teamName: 'Gone FC' });
    const reconciled = reconcileCoachCardTeamSelection(selected, [
      { id: 'a', clubName: 'Club A', teamName: 'Club A' },
      { id: 'b', clubName: 'Club B', teamName: 'Club B' },
    ]);
    expect(reconciled.teamOptionId).toBeNull();
    expect(reconciled.clubName).toBe('');
    expect(reconciled.teamName).toBe('');
  });

  it('auto-selects once a multi-team order drops back down to one remaining option', () => {
    const selected = selectCoachCardTeam(emptyCoachCardDraft(), { id: 'gone', clubName: 'Gone FC', teamName: 'Gone FC' });
    const reconciled = reconcileCoachCardTeamSelection(selected, [{ id: 'only', clubName: 'Only FC', teamName: 'Only FC' }]);
    expect(reconciled.teamOptionId).toBe('only');
  });

  it('a custom/free-text club name survives as a valid option (not limited to EMJFL clubs)', () => {
    const options = [{ id: 'custom:my-made-up-club-2026', clubName: 'My Made-Up Club 2026', teamName: 'My Made-Up Club 2026' }];
    const draft = reconcileCoachCardTeamSelection(emptyCoachCardDraft(), options);
    expect(draft.clubName).toBe('My Made-Up Club 2026');
  });
});

describe('validateCoachCardDraft / isCoachCardDraftComplete', () => {
  const options = [{ id: 'a', clubName: 'Club A', teamName: 'Club A' }];
  const photo = { id: 'coach-photo-1', file: new File(['x'], 'coach.jpg', { type: 'image/jpeg' }), srcUrl: 'blob:coach', fileName: 'coach.jpg' };

  function completeDraft(): CoachCardDraft {
    return { fullName: 'Alex Coach', roleTitle: 'Head Coach', teamOptionId: 'a', clubName: 'Club A', teamName: 'Club A', photo };
  }

  it('rejects a missing/blank full name', () => {
    expect(validateCoachCardDraft({ ...completeDraft(), fullName: '' }, options).fullName).toBeDefined();
    expect(validateCoachCardDraft({ ...completeDraft(), fullName: '   ' }, options).fullName).toBeDefined();
  });

  it('rejects a missing/blank role title', () => {
    expect(validateCoachCardDraft({ ...completeDraft(), roleTitle: '' }, options).roleTitle).toBeDefined();
    expect(validateCoachCardDraft({ ...completeDraft(), roleTitle: '   ' }, options).roleTitle).toBeDefined();
  });

  it('rejects no team selected', () => {
    expect(validateCoachCardDraft(emptyCoachCardDraft(), options).team).toBeDefined();
  });

  it('rejects a team selection that is not among the current options', () => {
    const draft = { ...completeDraft(), teamOptionId: 'not-in-options' };
    expect(validateCoachCardDraft(draft, options).team).toBeDefined();
  });

  it('rejects a missing photo', () => {
    expect(validateCoachCardDraft({ ...completeDraft(), photo: null }, options).photo).toBeDefined();
  });

  it('a fully complete draft has zero errors and is complete', () => {
    const draft = completeDraft();
    expect(validateCoachCardDraft(draft, options)).toEqual({});
    expect(isCoachCardDraftComplete(draft, options)).toBe(true);
  });

  it('"Other" role text is accepted as free text (no enum restriction)', () => {
    const draft = { ...completeDraft(), roleTitle: 'Kit Manager & Team Photographer' };
    expect(validateCoachCardDraft(draft, options).roleTitle).toBeUndefined();
  });
});

describe('coachCardDesignInheritance', () => {
  it('inherits the team design when every approved player in the group shares one template', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', club: 'Club A', templateId: 'hollinwood-blue' }),
      approvedPlayer({ id: 'p2', club: 'Club A', templateId: 'hollinwood-blue' }),
    ]);
    const options = coachCardTeamOptions(order);
    const inheritance = coachCardDesignInheritance(order, options[0].id);
    expect(inheritance.matchesTeam).toBe(true);
    expect(inheritance.templateId).toBe('hollinwood-blue');
  });

  it('falls back to the order default (not a guess) when the group has mixed templates', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', club: 'Club A', templateId: 'hollinwood-blue' }),
      approvedPlayer({ id: 'p2', club: 'Club A', templateId: 'hollinwood-red' }),
    ]);
    const options = coachCardTeamOptions(order);
    const inheritance = coachCardDesignInheritance(order, options[0].id);
    expect(inheritance.matchesTeam).toBe(false);
    expect(inheritance.templateId).toBe(order.templateDefault);
  });

  it('falls back to the order default when no team is selected', () => {
    const order = orderWith([approvedPlayer({ id: 'p1' })]);
    const inheritance = coachCardDesignInheritance(order, null);
    expect(inheritance.matchesTeam).toBe(false);
  });
});

describe('buildCoachCardPayload', () => {
  const options = [{ id: 'a', clubName: 'Club A', teamName: 'Club A' }];
  const photo = { id: 'coach-photo-1', file: new File(['x'], 'coach.jpg', { type: 'image/jpeg' }), srcUrl: 'blob:coach', fileName: 'coach.jpg' };

  function completeDraft(): CoachCardDraft {
    return { fullName: '  Alex Coach  ', roleTitle: ' Head Coach ', teamOptionId: 'a', clubName: 'Club A', teamName: 'Club A', photo };
  }

  it('produces exactly the five approved fields, trimmed, for a complete draft with a real storage key', () => {
    const payload = buildCoachCardPayload(completeDraft(), options, 'order-assets/order-1/coach/123-photo.jpg');
    expect(payload).toEqual({
      fullName: 'Alex Coach',
      roleTitle: 'Head Coach',
      clubName: 'Club A',
      teamName: 'Club A',
      photoKey: 'order-assets/order-1/coach/123-photo.jpg',
    });
  });

  it('returns null when no photo key has been produced yet', () => {
    expect(buildCoachCardPayload(completeDraft(), options, null)).toBeNull();
  });

  it('never accepts a blob: URL as a photoKey', () => {
    expect(buildCoachCardPayload(completeDraft(), options, 'blob:http://localhost/abc')).toBeNull();
  });

  it('never accepts a data: URL as a photoKey', () => {
    expect(buildCoachCardPayload(completeDraft(), options, 'data:image/png;base64,AAAA')).toBeNull();
  });

  it('returns null for an incomplete draft even with a valid photo key', () => {
    const incomplete = { ...completeDraft(), fullName: '' };
    expect(buildCoachCardPayload(incomplete, options, 'order-assets/order-1/coach/123-photo.jpg')).toBeNull();
  });
});
