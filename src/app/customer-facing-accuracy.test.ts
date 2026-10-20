import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { priceSquadInviteCommitments } from '@/lib/squad-invite-pricing';

const read = (file: string) => readFileSync(file, 'utf8');
const pounds = (pence: number) => `&pound;${(pence / 100).toFixed(2)}`;

describe('customer-facing pages describe Squad Invite as it actually works', () => {
  it('the Terms describe Squad Invite payment, with the same tiers the pricing code charges', () => {
    const terms = read('src/app/terms/page.tsx');
    expect(terms).not.toMatch(/no payment is collected or requested through Squad Invite/);
    expect(terms).not.toMatch(/Squad Invite does not currently collect payment/);
    expect(terms).not.toContain('[CURRENCY]');
    const tier = (families: number) => priceSquadInviteCommitments({ completedEligibleCommitmentCount: families, totalPrintQuantity: families }).unitPricePence;
    expect(terms).toContain(`1 family ${pounds(tier(1))}`);
    expect(terms).toContain(`2&ndash;9 families ${pounds(tier(2))}`);
    expect(tier(9)).toBe(tier(2));
    expect(terms).toContain(`10 or more families ${pounds(tier(10))}`);
    expect(terms).toMatch(/pays for their\s+own card/);
  });

  it('the Squad Invite start page no longer calls itself a test or a payment-required pilot', () => {
    const start = read('src/app/squad-invite/start/OrganiserStart.tsx');
    expect(start).not.toContain('Controlled pilot · payment required');
    expect(start).not.toContain('during this test');
    expect(start).toContain('public profiles are switched off');
  });

  it('the club page makes no card-weight claim until the stock is confirmed', () => {
    expect(read('src/app/football-cards-for-clubs/page.tsx')).not.toMatch(/\d{3}\s?gsm/i);
  });

  it('no other marketing surface claims a card weight (homepage, gallery, structured data, Merchant feed, about)', () => {
    for (const file of [
      'src/app/page.tsx',
      'src/components/marketing/CardGallery.tsx',
      'src/lib/marketing/structured-data.ts',
      'src/lib/marketing/merchant-feed.ts',
      'src/app/about/page.tsx',
    ]) {
      expect(read(file), file).not.toMatch(/\d{3}\s?gsm/i);
    }
    expect(read('src/app/about/page.tsx')).not.toContain('shipped from the US');
  });
});
