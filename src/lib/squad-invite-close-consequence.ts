import { priceOrder, MULTI_MIN_PLAYERS, SQUAD_MIN_PLAYERS } from './pricing-engine';

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export type CloseConsequence = {
  leadLine: string | null;
  leadBold: boolean;
  consequenceLine: string;
};

/**
 * Computes the exact confirmation copy shown before an organiser closes
 * their Squad Invite campaign, always derived from priceOrder()
 * (pricing-engine.ts) — the same constants migration-0050-contract.test.ts
 * already pins against finalise_squad_invite_pricing's own hardcoded SQL
 * values, so this preview can never silently drift from what finalising
 * actually computes later. Never a hardcoded price/threshold here.
 *
 * Single tier deliberately shows no total-saving figure and no bold
 * headline: completedCommitments × gap undercounts once a second player
 * joins, since the *incoming* player benefits from the lower rate too,
 * not just the one already committed — asserting a total here would need
 * a different (N+1-based) formula than the one used once heading toward
 * squad, which would need its own justification. Simpler and more honest
 * to just state the resulting price.
 *
 * Multi tier heading toward squad keeps the bold, leading total-saving
 * line — completedCommitments × (currentUnitPricePence −
 * nextTierUnitPricePence), the saving across everyone already committed.
 * Confirmed against a real case: 9 committed, 1 more to reach squad,
 * £3.00/card × 9 = £27.00.
 */
export function computeCloseConsequence(completedCommitments: number): CloseConsequence {
  const n = completedCommitments;
  const childWord = n === 1 ? 'child has' : 'children have';

  if (n < 1) {
    return {
      leadLine: null,
      leadBold: false,
      consequenceLine: 'No one has joined yet. Closing now stops anyone from joining. You can reopen this yourself later if you need to.',
    };
  }

  const current = priceOrder({ paidPlayerCount: n, totalPrintQuantity: n });
  const currentPrice = formatPence(current.unitPricePence);

  if (current.tier === 'squad') {
    return {
      leadLine: null,
      leadBold: false,
      consequenceLine: `${n} ${childWord} joined so far. Closing now locks everyone in at ${currentPrice} per card — your best available rate — and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.`,
    };
  }

  const nextThreshold = current.tier === 'single' ? MULTI_MIN_PLAYERS : SQUAD_MIN_PLAYERS;
  const next = priceOrder({ paidPlayerCount: nextThreshold, totalPrintQuantity: nextThreshold });
  const nextPrice = formatPence(next.unitPricePence);

  if (current.tier === 'single') {
    return {
      leadLine: `The price drops to ${nextPrice} per card once a second player joins.`,
      leadBold: false,
      consequenceLine: `${n} ${childWord} joined so far. Closing now locks the price in at ${currentPrice} per card, and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.`,
    };
  }

  const gap = nextThreshold - n;
  const totalSaving = formatPence(n * (current.unitPricePence - next.unitPricePence));
  return {
    leadLine: `${gap} more player${gap === 1 ? '' : 's'} would save the team ${totalSaving} — the price drops to ${nextPrice} per card once you reach ${nextThreshold} players.`,
    leadBold: true,
    consequenceLine: `${n} ${childWord} joined so far. Closing now locks everyone in at ${currentPrice} per card, and stops anyone else from joining or finishing their card. You can reopen this yourself later if you need to.`,
  };
}
