import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { classifyRefund } from './shopify-webhook';

/**
 * Replays an authentic Shopify Refund object through classifyRefund, with
 * no transaction and no database. Skipped unless REFUND_JSON is set.
 *
 * Get the JSON read-only from Shopify Admin API (same shape as the
 * refunds/create webhook body):
 *   GET /admin/api/<version>/orders/<shopify order id>/refunds.json
 * then save one element of "refunds" to a file and run, e.g. for the
 * 17 Oct £24.99 test (order #1029, one UK card):
 *   REFUND_JSON=refund-1029.json PAID_QTY=1 PAID_PENCE=2499 \
 *   CARD_VARIANTS=46800821715116 npx vitest run src/lib/refund-replay.local.test.ts
 * Expected for a full refund of that order: { kind: 'full', ... }.
 */
const file = process.env.REFUND_JSON;

describe.skipIf(!file)('authentic refund replay', () => {
  it('classifies the supplied refund', () => {
    const payload = JSON.parse(readFileSync(file as string, 'utf8'));
    const result = classifyRefund(payload, {
      cardVariantIds: (process.env.CARD_VARIANTS ?? '').split(',').filter(Boolean),
      paidQuantity: Number(process.env.PAID_QTY) || null,
      paidAmountPence: Number(process.env.PAID_PENCE) || null,
    });
    console.log('classifyRefund ->', JSON.stringify(result));
    expect(['full', 'partial', 'failed']).toContain(result.kind);
    if (process.env.EXPECT_KIND) expect(result.kind).toBe(process.env.EXPECT_KIND);
  });
});
