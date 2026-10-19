import { describe, expect, it, vi } from 'vitest';
import { LATE_REQUEST_GRACE_MS, resolveSubmissionStatus, type SubmissionStatusDeps } from './builder-submission-status';

const ID = '11111111-2222-4333-8444-555555555555';

function deps(script: { orders: boolean[]; states: Array<string | null> }) {
  const orders = [...script.orders];
  const states = [...script.states];
  const d: SubmissionStatusDeps & { revoke: ReturnType<typeof vi.fn>; wait: ReturnType<typeof vi.fn> } = {
    orderExists: vi.fn(async () => (orders.length > 1 ? orders.shift()! : orders[0])),
    capabilityState: vi.fn(async () => (states.length > 1 ? states.shift()! : states[0])),
    revoke: vi.fn(async () => undefined),
    wait: vi.fn(async () => undefined),
  };
  return d;
}

describe('resolveSubmissionStatus — interrupted submit recovery', () => {
  it('an order already exists for the submission → placed (nothing is resent)', async () => {
    const d = deps({ orders: [true], states: ['submitted'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('placed');
    expect(d.revoke).not.toHaveBeenCalled();
  });

  it('a submission mid-way (finalising) → in_progress, never revoked, sending stays paused', async () => {
    const d = deps({ orders: [false], states: ['finalising'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('in_progress');
    expect(d.revoke).not.toHaveBeenCalled();
  });

  it('an unused submission is revoked, re-checked after a grace pause, then reported not_placed', async () => {
    const d = deps({ orders: [false, false], states: ['active', 'revoked'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('not_placed');
    expect(d.revoke).toHaveBeenCalledWith(ID);
    expect(d.wait).toHaveBeenCalledWith(LATE_REQUEST_GRACE_MS);
  });

  it('an order that lands during the grace pause is reported placed (no duplicate)', async () => {
    const d = deps({ orders: [false, true], states: ['active'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('placed');
  });

  it('a late request that started finalising just before the revoke → in_progress', async () => {
    const d = deps({ orders: [false, false], states: ['active', 'finalising'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('in_progress');
  });

  it('"submitted" with no order is never guessed as safe → in_progress', async () => {
    expect(await resolveSubmissionStatus(ID, deps({ orders: [false], states: ['submitted'] }))).toBe('in_progress');
  });

  it('revoked, expired or unknown submissions can never create an order → not_placed', async () => {
    for (const state of ['revoked', 'expired', null]) {
      const d = deps({ orders: [false], states: [state] });
      expect(await resolveSubmissionStatus(ID, d)).toBe('not_placed');
      expect(d.revoke).not.toHaveBeenCalled();
    }
  });

  it('database errors propagate (the route answers 503, which keeps sending paused)', async () => {
    const d = deps({ orders: [false], states: ['active'] });
    d.orderExists = vi.fn(async () => { throw new Error('db down'); });
    await expect(resolveSubmissionStatus(ID, d)).rejects.toThrow('db down');
  });
});
