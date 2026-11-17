import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Official Collection is shown as "Coming soon" and cannot be chosen until
// official partner collections launch. Custom stays the only choice.
const source = readFileSync(path.join(__dirname, 'ProductionBuilder.tsx'), 'utf8');

describe('Official Collection is coming soon', () => {
  it('flags Official as coming soon and Custom as available', () => {
    expect(source).toMatch(/id: 'custom',[\s\S]*?comingSoon: false,/);
    expect(source).toMatch(/id: 'official',[\s\S]*?comingSoon: true,/);
  });

  it('renders a coming-soon option as a disabled button with a visible label', () => {
    expect(source).toContain('disabled={collection.comingSoon}');
    expect(source).toContain("className={collection.comingSoon ? 'coming-soon'");
    expect(source).toMatch(/className="uk-collection-soon">Coming soon<\/small>/);
  });

  it('refuses to switch to Official while it is unavailable', () => {
    expect(source).toMatch(/if \(collectionType === 'official'\) \{\s*if \(!OFFICIAL_COLLECTION_AVAILABLE\) return;/);
  });

  it('reopens a saved Official draft on the Custom Collection', () => {
    expect(source).toMatch(/!OFFICIAL_COLLECTION_AVAILABLE && restored\.order\.collectionType === 'official'\s*\? toCustomCollection\(/);
  });
});
