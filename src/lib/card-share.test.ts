import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_SHARE_CONFIRMATION_LABEL,
  CARD_SHARE_CONSENT_VERSION,
  CARD_SHARE_LINK_URL,
  CARD_SHARE_MESSAGE_TEXT,
  CARD_SHARE_RECALL_NOTICE,
  CARD_SHARE_WARNING,
  cardShareBlockedMessage,
  cardShareStageReducer,
  fetchCardShareEligibility,
  recordCardShareConsent,
  shouldHideCardShareEntirely,
} from './card-share';

describe('required copy is present and distinct', () => {
  it('the warning, confirmation label, and recall notice are all non-empty and distinct from each other', () => {
    const strings = [CARD_SHARE_WARNING, CARD_SHARE_CONFIRMATION_LABEL, CARD_SHARE_RECALL_NOTICE];
    for (const s of strings) expect(s.length).toBeGreaterThan(0);
    expect(new Set(strings).size).toBe(strings.length);
  });

  it('the warning names the photograph, card design and club/team branding, and that recipients may reshare', () => {
    expect(CARD_SHARE_WARNING).toMatch(/photograph/i);
    expect(CARD_SHARE_WARNING).toMatch(/card design/i);
    expect(CARD_SHARE_WARNING).toMatch(/club\/team branding/i);
    expect(CARD_SHARE_WARNING).toMatch(/save or share it again/i);
  });

  it('the confirmation label starts from an unticked premise — it is a statement to opt into, not a fact already asserted', () => {
    expect(CARD_SHARE_CONFIRMATION_LABEL).toMatch(/i understand and choose to share/i);
  });

  it('the recall notice is truthful about what Emblem cannot do, covering every listed distribution path', () => {
    expect(CARD_SHARE_RECALL_NOTICE).toMatch(/downloaded/i);
    expect(CARD_SHARE_RECALL_NOTICE).toMatch(/sent/i);
    expect(CARD_SHARE_RECALL_NOTICE).toMatch(/saved/i);
    expect(CARD_SHARE_RECALL_NOTICE).toMatch(/reposted/i);
  });
});

describe('the shared message text and link are fixed and generic — never derived from this specific order', () => {
  it('the link is the public builder marketing page, never a card-specific or recipient-specific page', () => {
    expect(CARD_SHARE_LINK_URL).toBe('https://www.emblem.cards/builder');
  });

  it('the message text names Emblem, invites the recipient to make their own, and contains the exact link', () => {
    expect(CARD_SHARE_MESSAGE_TEXT).toBe('Look what I made with Emblem.\nCreate your own card: https://www.emblem.cards/builder');
    expect(CARD_SHARE_MESSAGE_TEXT).toContain(CARD_SHARE_LINK_URL);
  });

  it('neither the link nor the text is a template literal capable of embedding an order id, submission key, token, or any other per-order value — both are plain constants', () => {
    expect(typeof CARD_SHARE_LINK_URL).toBe('string');
    expect(typeof CARD_SHARE_MESSAGE_TEXT).toBe('string');
    // A real UUID/token would contain a hyphen-separated hex run or be
    // otherwise much longer than this fixed, human-authored copy.
    expect(CARD_SHARE_LINK_URL).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(CARD_SHARE_MESSAGE_TEXT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe('shouldHideCardShareEntirely — hidden vs blocked-but-visible', () => {
  it('hides entirely for not_authenticated, not_authorized, and multi_child_order', () => {
    expect(shouldHideCardShareEntirely('not_authenticated')).toBe(true);
    expect(shouldHideCardShareEntirely('not_authorized')).toBe(true);
    expect(shouldHideCardShareEntirely('multi_child_order')).toBe(true);
  });

  it('shows a blocked state (not hidden) for card_suspended, card_revoked, and design_not_permitted', () => {
    expect(shouldHideCardShareEntirely('card_suspended')).toBe(false);
    expect(shouldHideCardShareEntirely('card_revoked')).toBe(false);
    expect(shouldHideCardShareEntirely('design_not_permitted')).toBe(false);
  });
});

describe('cardShareBlockedMessage', () => {
  it('gives a distinct, plain message for suspended, revoked, and not-permitted designs', () => {
    const suspended = cardShareBlockedMessage('card_suspended');
    const revoked = cardShareBlockedMessage('card_revoked');
    const notPermitted = cardShareBlockedMessage('design_not_permitted');
    expect(new Set([suspended, revoked, notPermitted]).size).toBe(3);
  });

  it('the design_not_permitted message matches the product spec\'s exact required neutral copy', () => {
    expect(cardShareBlockedMessage('design_not_permitted')).toBe('Sharing is not available for this design.');
  });

  it('never leaks internal reason vocabulary (e.g. the literal word "authorized") into user-facing copy', () => {
    for (const reason of ['card_suspended', 'card_revoked', 'design_not_permitted'] as const) {
      expect(cardShareBlockedMessage(reason)).not.toMatch(/authoriz/i);
    }
  });
});

describe('cardShareStageReducer', () => {
  it('open always starts the confirmation unticked, regardless of prior state', () => {
    expect(cardShareStageReducer({ type: 'closed' }, { type: 'open' })).toEqual({ type: 'confirming', checked: false });
    expect(cardShareStageReducer({ type: 'failed', message: 'x' }, { type: 'open' })).toEqual({ type: 'confirming', checked: false });
  });

  it('toggle-checked flips the checkbox only while confirming, and is a no-op otherwise', () => {
    expect(cardShareStageReducer({ type: 'confirming', checked: false }, { type: 'toggle-checked' })).toEqual({ type: 'confirming', checked: true });
    expect(cardShareStageReducer({ type: 'confirming', checked: true }, { type: 'toggle-checked' })).toEqual({ type: 'confirming', checked: false });
    expect(cardShareStageReducer({ type: 'closed' }, { type: 'toggle-checked' })).toEqual({ type: 'closed' });
  });

  it('cancel creates no image and no confirmed state, regardless of whether the box was ticked', () => {
    const result = cardShareStageReducer({ type: 'confirming', checked: true }, { type: 'cancel' });
    expect(result).toEqual({ type: 'cancelled' });
  });

  it('the full happy path: open -> tick -> prepare -> shared', () => {
    let state = cardShareStageReducer({ type: 'closed' }, { type: 'open' });
    state = cardShareStageReducer(state, { type: 'toggle-checked' });
    expect(state).toEqual({ type: 'confirming', checked: true });
    state = cardShareStageReducer(state, { type: 'start-preparing' });
    expect(state).toEqual({ type: 'preparing' });
    state = cardShareStageReducer(state, { type: 'shared' });
    expect(state).toEqual({ type: 'shared' });
  });

  it('the download-fallback path: preparing -> downloaded', () => {
    const state = cardShareStageReducer({ type: 'preparing' }, { type: 'downloaded' });
    expect(state).toEqual({ type: 'downloaded' });
  });

  it('a recoverable failure carries a distinct message and can be reset back to closed', () => {
    const failed = cardShareStageReducer({ type: 'preparing' }, { type: 'fail', message: 'boom' });
    expect(failed).toEqual({ type: 'failed', message: 'boom' });
    expect(cardShareStageReducer(failed, { type: 'reset' })).toEqual({ type: 'closed' });
  });
});

describe('fetchCardShareEligibility', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('parses an eligible response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, eligible: true, cardId: 'card-1', artworkCardDefinitionId: 'def-1' }),
    });
    const result = await fetchCardShareEligibility('order-1');
    expect(result).toEqual({ eligible: true, cardId: 'card-1', artworkCardDefinitionId: 'def-1' });
  });

  it('parses an ineligible response with its reason', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, eligible: false, reason: 'card_suspended' }),
    });
    const result = await fetchCardShareEligibility('order-1');
    expect(result).toEqual({ eligible: false, reason: 'card_suspended' });
  });

  it('fails closed to not_authorized on a network error, never throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await fetchCardShareEligibility('order-1');
    expect(result).toEqual({ eligible: false, reason: 'not_authorized' });
  });

  it('fails closed to not_authorized on a malformed response body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, somethingElse: true }),
    });
    const result = await fetchCardShareEligibility('order-1');
    expect(result).toEqual({ eligible: false, reason: 'not_authorized' });
  });
});

describe('recordCardShareConsent', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('sends the fixed consent version alongside the order id and result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, result: 'confirmed' }) });
    global.fetch = fetchMock;
    await recordCardShareConsent('order-1', 'confirmed');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/card-share/consent',
      expect.objectContaining({ body: JSON.stringify({ orderId: 'order-1', consentVersion: CARD_SHARE_CONSENT_VERSION, result: 'confirmed' }) })
    );
  });

  it('a cancelled result is a distinct, valid call, not an error path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, result: 'cancelled' }) });
    global.fetch = fetchMock;
    const result = await recordCardShareConsent('order-1', 'cancelled');
    expect(result).toEqual({ ok: true, result: 'cancelled' });
  });
});
