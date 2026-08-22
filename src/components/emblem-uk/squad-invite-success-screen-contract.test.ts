import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const successBlock = builder.match(/squadInvitePhase === 'success' \? \(([\s\S]*?)\) : \(/)?.[1] ?? '';

// The Squad Invite builder completion screen was a dead end — a save
// confirmation with no next step. This guards the fix: team name (already
// safely available via order.club, set from squadInviteContext at draft
// creation — no new fetch), what happens next, the organiser/staff
// boundary, a consolidated (non-repetitive) payment line, and a safe
// primary action that never offers to create a second child's card.
describe('Squad Invite builder completion screen — a real next step, not a dead end', () => {
  it('shows the team name when safely available, from the same order.club already set for this context', () => {
    expect(successBlock).toContain('{order.club && <p className="uk-squad-invite-success-team">{order.club}</p>}');
  });

  it('states the organiser sees aggregate progress only, and that staff review happens before production', () => {
    expect(successBlock).toContain('Your organiser sees aggregate team progress only');
    expect(successBlock).toContain('Emblem staff review this card before it goes into production.');
  });

  it('states the payment/delivery state once, without repeating the same fact twice', () => {
    expect(successBlock).toContain('A payment request will be emailed to you once your team&apos;s price is confirmed — nothing is charged today.');
    expect(successBlock).not.toContain('No payment is taken — payment requests remain disabled during this test.');
    expect(successBlock).toContain('Cards are delivered together to the approved organiser/coach.');
  });

  it('offers a safe primary action to an existing route, never a second child-card creation flow', () => {
    expect(successBlock).toContain('<a className="uk-wizard-primary" href="/squad-invite/join">Return to Squad Invite</a>');
    expect(successBlock).not.toMatch(/create another|add another child|start another card/i);
  });

  it('offers a genuinely supported secondary action back to the Emblem homepage', () => {
    expect(successBlock).toContain('<a className="uk-squad-invite-success-secondary" href="/">Return to Emblem homepage</a>');
  });

  it('never exposes child data outside this guardian-owned success state — no new player/child field reads introduced', () => {
    expect(successBlock).not.toMatch(/guardianEmail|childName|fullName|photoUrl/);
  });

  it('the new success-screen elements have real styles, not unstyled defaults', () => {
    expect(css).toContain('.uk-squad-invite-success-team');
    expect(css).toContain('.uk-squad-invite-success-actions');
    expect(css).toContain('.uk-squad-invite-success-secondary');
  });
});
