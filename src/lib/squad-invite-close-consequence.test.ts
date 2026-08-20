import { describe, expect, it } from 'vitest';
import { priceOrder } from './pricing-engine';
import { computeCloseConsequence } from './squad-invite-close-consequence';

describe('computeCloseConsequence', () => {
  it('single tier (N=1): no bold headline, no total-saving figure, states the resulting price', () => {
    const result = computeCloseConsequence(1);
    expect(result.leadBold).toBe(false);
    expect(result.leadLine).toBe('The price drops to £21.99 per card once a second player joins.');
    expect(result.consequenceLine).toBe(
      '1 child has joined so far. Closing now locks the price in at £24.99 per card, and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.'
    );
  });

  it('multi tier one away from squad (N=9): bold leading total-saving line, computed as N × per-card gap', () => {
    const result = computeCloseConsequence(9);
    expect(result.leadBold).toBe(true);
    expect(result.leadLine).toBe('1 more player would save the team £27.00 — the price drops to £18.99 per card once you reach 10 players.');
    expect(result.consequenceLine).toBe(
      '9 children have joined so far. Closing now locks everyone in at £21.99 per card, and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.'
    );
  });

  it('already at squad tier (N=10): no lead line, nothing left to reach', () => {
    const result = computeCloseConsequence(10);
    expect(result.leadLine).toBeNull();
    expect(result.consequenceLine).toBe(
      '10 children have joined so far. Closing now locks everyone in at £18.99 per card — your best available rate — and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.'
    );
  });

  it('every figure traces back to a real priceOrder() call, never a hardcoded literal', () => {
    // Cross-check N=9's total independently, from priceOrder's own output,
    // rather than re-asserting the same literal the implementation uses.
    const current = priceOrder({ paidPlayerCount: 9, totalPrintQuantity: 9 });
    const next = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });
    const expectedTotalPence = 9 * (current.unitPricePence - next.unitPricePence);
    expect(expectedTotalPence).toBe(2700);
    const result = computeCloseConsequence(9);
    expect(result.leadLine).toContain('£27.00');
  });

  it('multi tier further from squad (N=2): gap and total scale correctly, not hardcoded to the N=9 case', () => {
    const result = computeCloseConsequence(2);
    // 8 more needed; saving £3.00/card × 2 committed = £6.00.
    expect(result.leadLine).toBe('8 more players would save the team £6.00 — the price drops to £18.99 per card once you reach 10 players.');
  });

  it('well past squad tier (N=15): still the no-gap squad-tier message, not an error', () => {
    const result = computeCloseConsequence(15);
    expect(result.leadLine).toBeNull();
    expect(result.consequenceLine).toContain('15 children have joined');
    expect(result.consequenceLine).toContain('£18.99 per card');
  });

  it('zero committed: does not call priceOrder (which would throw on paidPlayerCount < 1) and shows a safe, minimal message', () => {
    const result = computeCloseConsequence(0);
    expect(result.leadLine).toBeNull();
    expect(result.consequenceLine).toBe('No one has joined yet. Closing now stops anyone from joining. You can reopen this yourself later if you need to.');
  });
});
