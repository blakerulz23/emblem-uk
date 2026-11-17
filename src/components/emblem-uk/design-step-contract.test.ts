import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Direct builder (adapted from Emblem Canada): the card is picked on its own
// "Pick their card" step, then "Add their details" on the next screen, with a
// pinned mini card on phones. Squad Invite keeps its single "Make it yours"
// screen with the style carousel, unchanged.
const source = readFileSync(path.join(__dirname, 'ProductionBuilder.tsx'), 'utf8');

describe('Pick their card, then Add their details', () => {
  it('the collection step continues to the design step', () => {
    expect(source).toContain("onClick={() => setActiveStepId('design')}>Continue</button>");
  });

  it('the design step lists every design as a radio, then goes to their details', () => {
    expect(source).toContain("{activeStepId === 'design' && (");
    expect(source).toMatch(/className="uk-design-grid" role="radiogroup"/);
    expect(source).toContain("onClick={() => setActiveStepId('personalise')}>Add their details</button>");
  });

  it('the direct details step shows the chosen design with a way back to change it', () => {
    expect(source).toMatch(/!squadInviteContext \? \(\s*<div className="uk-design-chosen">/);
    expect(source).toContain("onClick={() => setActiveStepId('design')}>Change</button>");
  });

  it('Squad Invite keeps its "Make it yours" screen and style carousel', () => {
    expect(source).toMatch(/squadInviteContext \? \(\s*<>\s*<p className="uk-wizard-kicker">Personalise cards<\/p>\s*<h1>Make it yours\.<\/h1>/);
    expect(source).toContain('<div className="uk-personalise-style">');
  });

  it('the pinned mini card is direct-builder only and taps back to the full preview', () => {
    expect(source).toMatch(/if \(squadInviteContext \|\| activeStepId !== 'personalise' \|\| !previewFrameEl\)/);
    expect(source).toMatch(/\{!squadInviteContext && selectedPlayer && \(\s*<button\s+type="button"\s+className=\{`uk-mini-card/);
    expect(source).toContain("previewFrameEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })");
  });
});
