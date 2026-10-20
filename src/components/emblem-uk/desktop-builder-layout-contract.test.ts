import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const stage = builder.slice(builder.indexOf('<section className="ukd-stage"'), builder.indexOf('function SquadUploadQueue'));
const desktopCss = css.slice(css.indexOf('/* ── Desktop builder (>=1180px)'));

describe('desktop builder layout (adapted from Emblem Canada)', () => {
  it('the stage renders the existing PlayerCard from the existing state — no second preview or state', () => {
    expect(stage).toContain('<PlayerCard order={order} player={stagePlayer} side={cardSide} />');
    // stagePlayer is selectedPlayer, except on the background step where only
    // the highlighted photo is swapped in for display.
    expect(builder).toMatch(/const stagePlayer = activeStepId === 'bg-removal' && bgPreviewPhoto && selectedPlayer\?\.photo\s*\? \{ \.\.\.selectedPlayer, photo: \{ \.\.\.selectedPlayer\.photo, srcUrl: bgPreviewPhoto, hiResUrl: bgPreviewPhoto \} \}\s*: selectedPlayer;/);
    expect(stage).toContain("onClick={() => setCardSide('front')}");
    expect(stage).toContain("onClick={() => setCardSide('back')}");
    expect(stage).not.toMatch(/useState|useReducer|useEffect/);
  });

  it('desktop controls reuse the existing handlers', () => {
    expect(stage).toContain('assignPhoto(selectedPlayer.id, event.target.files?.[0])');
    expect(stage).toContain('onClick={() => setSelectedId(player.id)}');
    expect(builder).toMatch(/<button type="button" className="ukd-back" onClick=\{goBack\} disabled=\{activeIndex === 0\}>Previous<\/button>/);
    expect(builder).toMatch(/const exitBuilder = \(\) => \(draftDone \? router\.push\('\/'\) : setExitPrompt\(true\)\);/);
  });

  it('the desktop layer only applies at >= 1180px; below that every new element is hidden and the mobile header remains', () => {
    expect(desktopCss).toMatch(/\.ukd-header,\s*\.ukd-progress,\s*\.ukd-footer,\s*\.ukd-stage \{\s*display: none;\s*\}/);
    expect(desktopCss).toMatch(/@media \(min-width: 1180px\) \{\s*\.uk-wizard-shell\.ukd \{/);
    expect(builder).toContain('<header className="uk-wizard-header">');
  });

  it('the form column stays a fixed width on large screens', () => {
    expect(desktopCss).toMatch(/--ukd-panel: 480px;/);
    expect(desktopCss).toMatch(/@media \(min-width: 1600px\) \{\s*\.uk-wizard-shell\.ukd \{ --ukd-panel: 520px; \}/);
  });

  it('the panel keeps the device-save opt-out and background removal (only inline previews are hidden on desktop)', () => {
    expect(builder).toContain('className="uk-draft-optout"');
    expect(desktopCss).toMatch(/\.ukd \.uk-wizard-panel \.uk-edit-preview,\s*\.ukd \.uk-wizard-panel \.uk-card-side-toggle \{\s*display: none;/);
    expect(desktopCss).not.toMatch(/uk-draft-optout|uk-bgremove-compare[^-]|uk-adult-permission[^\n]*display: none/);
  });
});
