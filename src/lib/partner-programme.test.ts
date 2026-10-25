import { describe, expect, it } from 'vitest';
import {
  commissionIsPayable,
  commissionPence,
  expectedDiscountPence,
  extractOrderDiscountCode,
  normalizePartnerCode,
  parsePartnerApplication,
  partnerCaption,
} from './partner-programme';
import { verifyPaidLineItem } from './shopify-webhook';

describe('partner codes', () => {
  it('normalises to upper case and refuses anything but 3–20 letters or digits', () => {
    expect(normalizePartnerCode(' coachJo ')).toBe('COACHJO');
    expect(normalizePartnerCode('AB')).toBeNull();
    expect(normalizePartnerCode('COACH-JO')).toBeNull();
    expect(normalizePartnerCode(42)).toBeNull();
  });

  it('reads the single discount code on a Shopify order', () => {
    expect(extractOrderDiscountCode({})).toEqual({ code: null });
    expect(extractOrderDiscountCode({ discount_codes: [] })).toEqual({ code: null });
    expect(extractOrderDiscountCode({ discount_codes: [{ code: 'coachjo' }] })).toEqual({ code: 'COACHJO' });
    expect(extractOrderDiscountCode({ discount_codes: [{ code: 'A' }, { code: 'B' }] })).toBe('multiple');
    expect(extractOrderDiscountCode({ discount_codes: [{ code: 'not valid!' }] })).toBe('multiple');
  });
});

describe('money', () => {
  it('expects the percentage of the line total, rounded to the penny', () => {
    expect(expectedDiscountPence(2499, 1, 2000)).toBe(500);
    expect(expectedDiscountPence(2499, 2, 2000)).toBe(1000);
    expect(expectedDiscountPence(2499, 3, 1500)).toBe(1125);
  });

  it('pays commission on what was paid for cards, rounded down', () => {
    expect(commissionPence(1999, 2000)).toBe(399);
    expect(commissionPence(0, 2000)).toBe(0);
    expect(commissionPence(-5, 2000)).toBe(0);
  });

  it('only pays a pending commission whose hold has passed on an order that is still paid', () => {
    const now = new Date('2026-12-15T00:00:00Z');
    const due = { status: 'pending' as const, hold_until: '2026-12-01T00:00:00Z' };
    expect(commissionIsPayable(due, 'paid', now)).toBe(true);
    expect(commissionIsPayable(due, 'fulfilled', now)).toBe(true);
    expect(commissionIsPayable(due, 'refunded', now)).toBe(false);
    expect(commissionIsPayable({ ...due, hold_until: '2026-12-20T00:00:00Z' }, 'paid', now)).toBe(false);
    expect(commissionIsPayable({ ...due, status: 'paid' }, 'paid', now)).toBe(false);
    expect(commissionIsPayable({ ...due, status: 'void' }, 'paid', now)).toBe(false);
  });

  it('captions start with "Ad", as the ASA guide asks', () => {
    expect(partnerCaption('COACHJO', 2000)).toMatch(/^Ad · 20% off .*COACHJO/);
    expect(partnerCaption('COACHJO', 0)).toMatch(/^Ad · /);
  });
});

describe('parsePartnerApplication', () => {
  const valid = {
    name: 'Jo Coach', email: 'Jo@Example.com', platform: 'tiktok', profileUrl: 'https://www.tiktok.com/@jo',
    audience: 'Grassroots coaches and parents in the North West', confirmedAdult: true, confirmedUk: true, acceptedTerms: true,
  };

  it('accepts a complete application and lower-cases the email', () => {
    const result = parsePartnerApplication(valid);
    expect(result.ok && result.value.email).toBe('jo@example.com');
  });

  it.each([
    ['confirmedAdult', false, /18/],
    ['confirmedUk', false, /UK/],
    ['acceptedTerms', false, /terms/],
    ['profileUrl', 'http://insecure.example', /https/],
    ['platform', 'myspace', /platform/],
    ['email', 'nope', /email/],
  ])('refuses %s = %s', (field, value, message) => {
    const result = parsePartnerApplication({ ...valid, [field]: value });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(message);
  });
});

describe('verifyPaidLineItem with a partner discount', () => {
  const VARIANT = '123';
  const order = (allocation: string | null, quantity = 2) => ({
    currency: 'USD',
    presentment_currency: 'GBP',
    financial_status: 'paid',
    line_items: [{
      variant_id: 123,
      quantity,
      price_set: { presentment_money: { amount: '24.99', currency_code: 'GBP' } },
      discount_allocations: allocation === null ? [] : [{ amount_set: { presentment_money: { amount: allocation, currency_code: 'GBP' } } }],
    }],
  });

  it('accepts exactly the partner percentage and reports it', () => {
    expect(verifyPaidLineItem(order('10.00'), VARIANT, 2, 2499, 'GBP', 2000)).toEqual({ ok: true, currency: 'GBP', discountPence: 1000 });
  });

  it('allows one penny of rounding either way, and no more', () => {
    expect(verifyPaidLineItem(order('9.99'), VARIANT, 2, 2499, 'GBP', 2000).ok).toBe(true);
    expect(verifyPaidLineItem(order('10.01'), VARIANT, 2, 2499, 'GBP', 2000).ok).toBe(true);
    expect(verifyPaidLineItem(order('10.02'), VARIANT, 2, 2499, 'GBP', 2000)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('accepts no discount at all with a partner code (full price paid)', () => {
    expect(verifyPaidLineItem(order(null), VARIANT, 2, 2499, 'GBP', 2000)).toEqual({ ok: true, currency: 'GBP', discountPence: 0 });
  });

  it('still rejects any discount when no partner percentage is given', () => {
    expect(verifyPaidLineItem(order('10.00'), VARIANT, 2, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('never accepts a percentage outside 0–50%', () => {
    expect(verifyPaidLineItem(order('29.99'), VARIANT, 2, 2499, 'GBP', 6000)).toEqual({ ok: false, reason: 'discount_mismatch' });
    expect(verifyPaidLineItem(order('10.00'), VARIANT, 2, 2499, 'GBP', 0)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('still checks the undiscounted unit price', () => {
    const cheaper = order('10.00');
    cheaper.line_items[0].price_set.presentment_money.amount = '19.99';
    expect(verifyPaidLineItem(cheaper, VARIANT, 2, 2499, 'GBP', 2000)).toEqual({ ok: false, reason: 'price_mismatch' });
  });
});
