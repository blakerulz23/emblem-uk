import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const successBlock = builder.match(/squadInvitePhase === 'success' \? \(([\s\S]*?)\) : \(/)?.[1] ?? '';

// Founder-directed redesign: the Squad Invite completion screen was a dead
// end — a flat save confirmation with no next step, five repetitive ticked
// statements, an oversized primary CTA pointing at an already-completed
// task, and internal wording ("in a future approved live flow") that was
// also factually stale once Squad Invite payment mode went live (migration
// 0067). This guards the redesign: the finished card as the emotional
// focus, a real primary action (share, gated on the server-controlled PR
// #44 eligibility check — never a new/weaker authorization path), a
// downgraded secondary action to a genuinely useful destination, a quiet
// tertiary homepage link, and concise, truthful "what happens next" copy.
describe('Squad Invite builder completion screen — a real next step, not a dead end', () => {
  it('shows the heading without stale punctuation and the team name from the same order.club already set for this context', () => {
    expect(successBlock).toContain('<h1>Your child&apos;s card is saved</h1>');
    expect(successBlock).toContain("{order.club && <p className=\"uk-squad-invite-success-team\">It&apos;s been added to {order.club}&apos;s squad order.</p>}");
  });

  it('presents the finished card prominently, using the same PlayerCard/side-toggle the pre-success review step already renders — no new fetch, no new component', () => {
    expect(successBlock).toContain('<div className="uk-squad-invite-success-card">');
    expect(successBlock).toContain('<PlayerCard order={order} player={squadInvitePlayer} side={cardSide} />');
    expect(successBlock).toContain('uk-card-side-toggle wide');
    expect(successBlock).toContain("onClick={() => setCardSide('front')}");
    expect(successBlock).toContain("onClick={() => setCardSide('back')}");
  });

  it('gives the card an accessible text alternative', () => {
    expect(successBlock).toContain('role="img" aria-label="Your child\'s finished Emblem card"');
  });

  it('renders the primary Share your card action only when a real Squad Invite order id exists, wired to the Squad Invite-specific capture path — never the ordinary builder\'s submittedOrderId/captureShareImage', () => {
    const idx = successBlock.indexOf('{squadInviteOrderId && (');
    expect(idx).toBeGreaterThan(-1);
    const section = successBlock.slice(idx, successBlock.indexOf(')}', idx));
    expect(section).toContain('<SquadInviteShareSheet orderId={squadInviteOrderId} getShareImage={captureSquadInviteShareImage} />');
  });

  it('offers a downgraded secondary action to squad progress — an outline style, never the dominant CTA class', () => {
    expect(successBlock).toContain('<Link href="/squad-invite/join" className="uk-squad-invite-success-outline">View squad progress</Link>');
    // The outline class must be visually distinct from uk-wizard-primary —
    // this action is deliberately not styled as the dominant CTA.
    const outlineTagIdx = successBlock.indexOf('uk-squad-invite-success-outline');
    const lineStart = successBlock.lastIndexOf('\n', outlineTagIdx);
    const lineEnd = successBlock.indexOf('\n', outlineTagIdx);
    expect(successBlock.slice(lineStart, lineEnd)).not.toContain('uk-wizard-primary');
  });

  it('offers a quiet tertiary text-link action back to the Emblem homepage', () => {
    expect(successBlock).toContain('<Link href="/" className="uk-squad-invite-success-secondary">Return to Emblem homepage</Link>');
  });

  it('never offers a second child-card creation flow anywhere on this screen', () => {
    expect(successBlock).not.toMatch(/create another|add another child|start another card/i);
  });

  it('replaces the old five-item repetitive tick list with a compact, truthful "What happens next" section', () => {
    expect(successBlock).toContain('<h2>What happens next</h2>');
    expect(successBlock).toContain('Emblem staff review this card before it goes into production.');
    expect(successBlock).toContain('A payment request will be emailed to you once your team&apos;s price is confirmed — nothing is charged today.');
    expect(successBlock).toContain('The completed cards are delivered together to your approved organiser or coach.');
    // Old five-bullet list, and its unstyled/removed markup, must be gone.
    expect(successBlock).not.toContain('uk-squad-invite-success-list');
  });

  it('states the organiser/privacy boundary once, plainly — never exposing child photo/card detail to the organiser', () => {
    expect(successBlock).toContain("Your organiser can see the squad&apos;s overall progress, not your child&apos;s card details or photograph.");
  });

  it('never retains the stale, internal-sounding "in a future approved live flow" wording — Squad Invite payment mode has been live since migration 0067', () => {
    expect(successBlock).not.toContain('in a future approved live flow');
    expect(builder).not.toContain('in a future approved live flow');
  });

  it('never exposes child data outside this guardian-owned success state — no new player/child field reads introduced', () => {
    expect(successBlock).not.toMatch(/guardianEmail|childName|fullName|photoUrl/);
  });

  it('the new success-screen elements have real styles, not unstyled defaults', () => {
    expect(css).toContain('.uk-squad-invite-success-card');
    expect(css).toContain('.uk-squad-invite-success-outline');
    expect(css).toContain('.uk-squad-invite-success-secondary');
    expect(css).toContain('.uk-squad-invite-success-next');
    expect(css).toContain('.uk-squad-invite-success-privacy');
  });
});

describe('Squad Invite success screen — order id capture, the foundation the share action depends on', () => {
  it('captures the real orderId from the commit route\'s own response body on success — never derives an order id from the participation id or any other client-side value', () => {
    const idx = builder.indexOf('const successBody = await response.json()');
    expect(idx).toBeGreaterThan(-1);
    const section = builder.slice(idx, idx + 300);
    expect(section).toContain("if (successBody?.orderId) setSquadInviteOrderId(successBody.orderId);");
    expect(section).toContain("setSquadInvitePhase('success');");
  });

  it('squadInviteOrderId starts null and is set only from that response body — the success screen must never assume an order id exists before the response is read', () => {
    expect(builder).toContain('const [squadInviteOrderId, setSquadInviteOrderId] = useState<string | null>(null);');
  });
});
