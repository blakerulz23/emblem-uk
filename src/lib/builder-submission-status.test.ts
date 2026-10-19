import { describe, expect, it, vi } from 'vitest';
import { resolveSubmissionStatus, type SubmissionStatusDeps } from './builder-submission-status';

const ID = '11111111-2222-4333-8444-555555555555';

function deps(script: { orders: boolean[]; states: Array<string | null>; revokes?: boolean[] }) {
  const next = <T,>(list: T[]) => (list.length > 1 ? list.shift()! : list[0]);
  const orders = [...script.orders];
  const states = [...script.states];
  const revokes = [...(script.revokes ?? [false])];
  const d: SubmissionStatusDeps & { revokeIfUnused: ReturnType<typeof vi.fn> } = {
    orderExists: vi.fn(async () => next(orders)),
    capabilityState: vi.fn(async () => next(states)),
    revokeIfUnused: vi.fn(async () => next(revokes)),
  };
  return d;
}

describe('resolveSubmissionStatus — interrupted submit recovery', () => {
  it('an order already exists for the submission → placed, and nothing is revoked', async () => {
    const d = deps({ orders: [true], states: ['submitted'] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('placed');
    expect(d.revokeIfUnused).not.toHaveBeenCalled();
  });

  it('an unused submission is atomically revoked → not_placed (no later request can create an order under it)', async () => {
    const d = deps({ orders: [false], states: ['active'], revokes: [true] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('not_placed');
    expect(d.revokeIfUnused).toHaveBeenCalledWith(ID);
  });

  it('a submission mid-way (finalising) → in_progress; the revoke never touches it', async () => {
    const d = deps({ orders: [false], states: ['finalising'], revokes: [false] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('in_progress');
  });

  it('submitted with the order now visible → placed; submitted without one is never guessed safe → in_progress', async () => {
    expect(await resolveSubmissionStatus(ID, deps({ orders: [false, true], states: ['submitted'] }))).toBe('placed');
    expect(await resolveSubmissionStatus(ID, deps({ orders: [false], states: ['submitted'] }))).toBe('in_progress');
  });

  it('a failed finalising put back to active is revoked on the second attempt → not_placed', async () => {
    const d = deps({ orders: [false], states: ['active'], revokes: [false, true] });
    expect(await resolveSubmissionStatus(ID, d)).toBe('not_placed');
    expect(d.revokeIfUnused).toHaveBeenCalledTimes(2);
  });

  it('still active after two revoke attempts → throws (route answers 503, sending stays paused)', async () => {
    await expect(resolveSubmissionStatus(ID, deps({ orders: [false], states: ['active'], revokes: [false] }))).rejects.toThrow();
  });

  it('revoked, expired or unknown submissions can never create an order → not_placed', async () => {
    for (const state of ['revoked', 'expired', null]) {
      expect(await resolveSubmissionStatus(ID, deps({ orders: [false], states: [state] }))).toBe('not_placed');
    }
  });

  it('database errors propagate (the route answers 503, which keeps sending paused)', async () => {
    const d = deps({ orders: [false], states: ['active'] });
    d.orderExists = vi.fn(async () => { throw new Error('db down'); });
    await expect(resolveSubmissionStatus(ID, d)).rejects.toThrow('db down');
  });
});
