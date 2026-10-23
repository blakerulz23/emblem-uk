import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// Gate 3.12 contracts: the recovery screen never offers a card set to the
// purchaser, the server checks run before the first write, marketing neither
// promises guardian linking for friends' children nor claims that guardians
// are verified, and the README discloses the multi-card buyer path and the
// binding pilot control.
const read = (p: string) => readFileSync(p, 'utf8');

describe('card-set recovery and first-guardian claim contracts', () => {
  it('the recovery screen shows the verification notice instead of the buttons for a card set, failing closed when the flag is missing', () => {
    const ui = read('src/app/os/overlays/RecoverByEmail.tsx');
    expect(ui).toContain('We need to verify this card set before linking it to your account. Please contact Emblem support.');
    expect(ui).toContain('verificationRequired: o.verificationRequired !== false');
    const notice = ui.indexOf('{c.verificationRequired ? (');
    expect(notice).toBeGreaterThan(0);
    expect(notice).toBeLessThan(ui.indexOf("'This is my child'"));
    expect(notice).toBeLessThan(ui.indexOf('Send to the right parent'));
    expect(ui).toMatch(/role="alert"[^>]*>\{claimError\.message\}/);
  });

  it('recovery self: the database card count and the coach check run before the first claim write', () => {
    const route = read('src/app/api/os/recover/route.ts');
    const self = route.indexOf("if (decision === 'self') {");
    const count = route.indexOf(".select('id', { count: 'exact', head: true })", self);
    const coach = route.indexOf('checkFirstGuardianClaim(serviceRole, card.player_id, user.id)', self);
    const write = route.indexOf('claimPlayerForCard(serviceRole, card, user.id)', self);
    expect(self).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(self);
    expect(route).toContain('count !== 1');
    expect(coach).toBeGreaterThan(count);
    expect(write).toBeGreaterThan(coach);
    expect(route).toContain('verificationRequired: orderCards.length !== 1');
  });

  it('card claim: the coach check runs before ensureProfileRole, the first write', () => {
    const route = read('src/app/api/os/claim/route.ts');
    const post = route.indexOf('export async function POST');
    const check = route.indexOf('checkFirstGuardianClaim(serviceRole, card.player_id, user.id)', post);
    const firstWrite = route.indexOf('ensureProfileRole(serviceRole, user.id', post);
    expect(check).toBeGreaterThan(post);
    expect(firstWrite).toBeGreaterThan(check);
  });

  it('the authz README discloses the remaining N1 risk exactly and no longer overstates what is closed', () => {
    const readme = read('supabase/tests/authz/README.md').replace(/\s+/g, ' ');
    expect(readme).toContain('it cannot prove that an otherwise unrelated account holding the code or invite is not controlled by that coach');
    expect(readme).toContain('Preventing this completely requires an additional staff, club-welfare or real-world identity-verification step');
    expect(readme).not.toContain('a squad purchaser gains no guardian authority from the order');
    expect(readme).not.toMatch(/second account[^.]*(is|are) (now )?(blocked|detected|prevented)/i);
    expect(readme).toContain('**Safeguarding-owner decision on N1 (blank; to be completed by the owner):**');
    expect(readme).toContain('purchaser `self` recovery works only for a single-card order');
  });

  it('the README discloses that a central multi-card buyer can become each child\'s guardian and records the binding pilot control', () => {
    const readme = read('supabase/tests/authz/README.md').replace(/\s+/g, ' ');
    expect(readme).not.toContain('Multi-card purchasers cannot link profiles themselves');
    expect(readme).not.toContain('a squad purchase does not itself create guardian authority');
    expect(readme).toContain('A central multi-card buyer can become the first guardian of every child on the order.');
    expect(readme).toContain('**Binding pilot control (release condition for this release; not optional):**');
    expect(readme).toContain('No centrally purchased multi-card order');
    expect(readme).toContain('Squad pilots use only the Squad Invite flow');
    expect(readme).toContain('**Release conditions (confirm before step 1).**');
    expect(readme).toContain('| Binding pilot control (release condition, fixed) |');
    expect(readme).toContain('| Squad Invite card custody until families claim (owner decision) | |');
  });

  it('marketing no longer promises a set for friends or claims that guardians are verified', () => {
    const home = read('src/app/page.tsx');
    expect(home).not.toMatch(/siblings (and|or) friends/i);
    expect(home).not.toMatch(/verified guardian|guardian is verified|verify each child/i);
    expect(home).toContain('Buying the cards does not make you each child’s guardian');
  });
});
