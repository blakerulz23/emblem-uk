import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'SquadInviteJourneySection.tsx'), 'utf8');
const clubsPage = readFileSync(join(__dirname, '../app/football-cards-for-clubs/page.tsx'), 'utf8');

describe('SquadInviteJourneySection — wording follows the live Squad Invite workflow', () => {
  it('never says reaching a squad target triggers printing', () => {
    expect(source).not.toMatch(/once the squad target is reached/i);
    expect(source).not.toMatch(/players ready/i);
    expect(source).toContain('Paid cards are printed and delivered together');
  });

  it('sets the price at the deadline from committed families, with each family paying', () => {
    expect(source).toContain('At the deadline, your price is set by the number of families committed. Each family then pays for their own card.');
    expect(source).toContain('${PRICES.squad} per card when 10 or more families commit');
  });

  it('ties the free coach card to 10 paid families', () => {
    expect(source).toContain('Free coach card once 10 families have paid.');
    expect(source).not.toMatch(/different players unlock/i);
  });

  it('labels the example squad as illustrative and uses only current card artwork, no packaging', () => {
    expect(source).toContain("exampleTag: 'Illustrative example'");
    expect(source).toContain('Westbrook Juniors U12');
    expect(source).not.toMatch(/squad-invite-family-card-|squad-invite-card-stack-box|AFC Oldham/);
  });

  it('is the clubs page How it works, linking to the Squad Invite start', () => {
    expect(clubsPage).toContain('<SquadInviteJourneySection');
    expect(clubsPage).toContain('eyebrow="How it works"');
    expect(clubsPage).toContain('ctaHref={startHref}');
    expect(clubsPage).not.toContain('emh-clubs-how');
  });
});
