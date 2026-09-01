import { describe, expect, it } from 'vitest';
import {
  UNAVAILABLE_PAYMENT_PREVIEW, assertSafePaymentPreviewProjection, createSquadInvitePaymentPreviewToken,
  hashSquadInvitePaymentPreviewToken,
} from './squad-invite-payment-preview-token';

describe('Squad Invite payment preview credentials', () => {
  it('creates independent high-entropy credentials and stores only stable hashes', () => {
    const first = createSquadInvitePaymentPreviewToken();
    const second = createSquadInvitePaymentPreviewToken();
    expect(first.token).toHaveLength(43);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashSquadInvitePaymentPreviewToken(first.token));
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed tokens before hashing', () => {
    expect(() => hashSquadInvitePaymentPreviewToken('participation-id')).toThrow('Invalid payment preview credential');
  });

  it('allows only the explicit safe projection', () => {
    const safe = {
      status: 'payment_requested' as const,
      teamName: 'Ashton Juniors U10',
      tier: 'multi' as const,
      unitPricePence: 2199,
      printQuantity: 1,
      totalPence: 2199,
      deadlineAt: '2026-09-04T13:00:00Z',
      orderRef: 'EMB-1234',
      card: {
        templateId: 'custom-solar', sport: 'soccer', name: 'Joe B.', number: '7', team: 'Ashton Juniors U10',
        position: 'Midfielder', logo: null, photoStorageKey: 'order-assets/abc/child:photo', photoCrop: null, stats: null,
      },
    };
    expect(assertSafePaymentPreviewProjection(safe)).toEqual(safe);
    expect(() => assertSafePaymentPreviewProjection({ ...safe, purchaserEmail: 'never@example.test' })).toThrow(/Unsafe/);
    expect(() => assertSafePaymentPreviewProjection({ ...safe, participationId: 'never' })).toThrow(/Unsafe/);
  });

  it('uses one uniform unavailable response', () => {
    expect(UNAVAILABLE_PAYMENT_PREVIEW).toEqual({ error: 'Payment preview unavailable' });
  });
});
