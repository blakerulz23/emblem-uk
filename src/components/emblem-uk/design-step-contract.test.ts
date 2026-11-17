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

describe('designs ranked by their kit colours', () => {
  it('reads the kit only from a background-removed cut-out, in the direct builder, on the Custom Collection', () => {
    expect(source).toMatch(/const kitPhotoUrl = !squadInviteContext && order\.collectionType === 'custom' && selectedPlayer\?\.photo\?\.bgRemoved \? selectedPlayer\.photo\.srcUrl : '';/);
    expect(source).toContain('sampleJerseyColours(kitPhotoUrl)');
  });

  it('orders the designs by the ranking and badges the top one', () => {
    expect(source).toContain('return kitRanking ? kitRanking.map((ranked) => ranked.item) : collectionTemplates;');
    expect(source).toContain('}, [order, selectedPlayer, kitRanking]);');
    expect(source).toContain('{template.id === kitBestMatchId && <span className="uk-design-best">Best match</span>}');
  });

  it('pre-selects the best match only on the design step and never over a hand-picked design', () => {
    expect(source).toMatch(/if \(activeStepId !== 'design' \|\| !kitBestMatchId \|\| !selectedPlayer \|\| selectedPlayer\.designChosen\) return;/);
    expect(source).toContain('patchPlayer(selectedPlayer.id, { templateId, designChosen: true });');
  });
});

describe('phones: no accidental zoom, photo locked until Adjust photo', () => {
  const css = readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');

  it('builder fields are 16px on touch phones, so iOS does not zoom on focus', () => {
    expect(css).toMatch(/@media \(pointer: coarse\) and \(max-width: 1179px\) \{\s*\.uk-builder-shell input:not/);
    expect(css).toMatch(/\.uk-builder-shell textarea \{\s*font-size: 16px;/);
  });

  it('double-tap zoom is off on builder controls', () => {
    expect(css).toMatch(/\.uk-builder-shell \.uk-edit-preview \{\s*touch-action: manipulation;/);
  });

  it('the photo only takes gestures, sliders and the drag affordance once Adjust photo is on', () => {
    expect(source).toContain("window.matchMedia('(pointer: coarse) and (max-width: 1179px)')");
    expect(source).toContain('const photoLocked = touchPhone && !photoAdjusting;');
    expect(source).toContain('const photoMovable = photoEditable && !photoLocked;');
    expect(source).toContain('enabled: photoMovable,');
    expect(source).toContain('photoLocked ? null : (');
    expect(source).toContain('onClick={() => setPhotoAdjusting(true)}>Adjust photo</button>');
    expect(source).toContain('onClick={() => setPhotoAdjusting(false)}>Done</button>');
  });

  it('locks again on another step, side or card', () => {
    expect(source).toContain('useEffect(() => { setPhotoAdjusting(false); }, [activeStepId, cardSide, selectedPlayer?.id]);');
  });
});
