import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const ORGANISER_START = 'src/app/squad-invite/start/OrganiserStart.tsx';
const FORM_LIB = 'src/lib/squad-invite-organiser-form.ts';

// UI/content polish pass — this guards the parts that could silently break
// the underlying data contract while the presentation changes underneath.
describe('Organiser form polish — age-group dropdown', () => {
  it('offers the canonical U6-U18 list plus a free-text Other fallback, never removing free text', () => {
    const lib = read(FORM_LIB);
    expect(lib).toContain("export const FOOTBALL_AGE_GROUPS = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18'] as const;");
    const source = read(ORGANISER_START);
    expect(source).toContain('FOOTBALL_AGE_GROUPS.map(g=>');
    expect(source).toContain('Other (please specify)');
  });

  it('the dropdown still writes into the same ageGroup form field submit() sends unchanged, never a new key', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain("field('ageGroup',");
    // submit() still spreads the whole form object as-is — no renamed or added field.
    expect(source).toContain('...form,expectedSquadSize:Number(form.expectedSquadSize)');
  });

  it('selecting Other clears the value so the organiser must type a real answer, rather than persisting the literal word "Other"', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain("if(v==='__other__'){setAgeGroupOther(true);field('ageGroup','');}");
  });
});

describe('Organiser form polish — delivery recipient copy and role dropdown', () => {
  it('uses the clearer field labels and helper copy requested for the delivery recipient', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain("Who should receive the team&apos;s cards?");
    expect(source).toContain("Delivery recipient's full name");
    expect(source).toContain('The adult who will accept the completed team delivery. This can be you.');
    expect(source).toContain('Their role at the club or team');
    expect(source).toContain('For example: head coach, team manager or club secretary.');
  });

  it('offers the requested canonical roles plus Other, staying free text underneath', () => {
    const lib = read(FORM_LIB);
    expect(lib).toContain("export const DELIVERY_RECIPIENT_ROLES = ['Head coach', 'Assistant coach', 'Team manager', 'Club secretary or official'] as const;");
    const source = read(ORGANISER_START);
    expect(source).toContain('DELIVERY_RECIPIENT_ROLES.map(r=>');
    expect(source).toContain("field('deliveryRecipientRole',");
  });
});

describe('Organiser form polish — projected pricing summary card', () => {
  it('distinguishes squad size, tier, coach-card benefit and the not-a-final-quote caveat as separate rows, not one paragraph', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('function PricingProjectionCard(');
    expect(source).toContain('Estimated squad size');
    expect(source).toContain('Projected tier');
    expect(source).toContain('Coach card');
    expect(source).toContain('This is an estimate, not a final quote.');
  });

  it('never invents a price and still relies only on the existing projectedSquadIncentive() output', () => {
    const source = read(ORGANISER_START);
    expect(source).not.toMatch(/£\d/);
    expect(source).toContain('projection.detail');
    expect(source).toContain('projection.tier');
  });

  it('is shown on both the details form and the review screen', () => {
    const source = read(ORGANISER_START);
    const occurrences = source.split('<PricingProjectionCard').length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('Organiser form polish — accessible structure', () => {
  it('groups the details form into the requested logical sections', () => {
    const source = read(ORGANISER_START);
    for (const section of ['Organiser', 'Team', 'Invitation plan', 'Delivery contact', 'Confirmations']) {
      expect(source).toContain(`<legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">${section}</legend>`);
    }
  });

  it('uses a top-level div, not a nested <main> landmark (shared chrome already renders one)', () => {
    const source = read(ORGANISER_START);
    expect(source).not.toContain('<main');
    expect(source).toContain('return <div className="mx-auto min-h-screen max-w-2xl px-5 py-12 pb-28">');
  });

  it('inline field and declaration errors are announced via role="alert"', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('id={errorId} role="alert"');
  });
});
