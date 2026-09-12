import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate 2 child-data erasure (migration 0076) is scoped to deletion of
 * stored source/derived files and DB records — it must never change how
 * Gemini, background removal, /api/ai-mockup, cropping, card artwork,
 * PDF/print capture, pricing, Shopify, or Squad Invite's purchasing
 * behaviour actually work. Hashes match every prior baseline already
 * pinned by hotfix-0073/dob-removal/card-lifecycle-protected-areas.test.ts
 * (computed independently here via sha256sum, not copied) — any future
 * change on this branch that touches one of these files should fail here.
 */
const PROTECTED_FILES: Record<string, string> = {
  // Updated for the background-removal white-halo fix — see
  // dob-removal-protected-areas.test.ts's own comment on this same line for
  // the full justification (alpha-aware colour decontamination, not
  // spatial adjacency; alpha ramp unchanged; verified against a hard-edge
  // simulation and the real CardArt/print-capture pipeline).
  'src/components/builder/emblem/bgRemoval.ts': '637cb5e1f4c866e84b0edfa0bebf89daf183fecf448fea4b20d8d2ca8f77301c',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  'src/components/builder/emblem/aiMockup.ts': 'f48196a262d75042dba471e60b4ac419c8617c9a3d48940ad9799d7c1dd825e1',
  'src/lib/pdf-generator.ts': '94e796512bd29560755659bc25513820cc142fc8a755f353705539f750f49c26',
  'src/lib/card-definition.tsx': '1c6e548d2dd64f5a4c6dc4a80f3414648119b935d12306786dc7a3e2908b26b5',
  // Updated for the Hollinwood typography correction — see card-lifecycle-
  // protected-areas.test.ts's own comment for the same reasoning.
  'src/lib/print-capture.ts': 'e329ab40d2f67e3fdfa458f4c504e46bc9ebf8e9f5e98c337e9378cd95a08d07',
  // Updated for the Auto-fit Player / zoom-out photo-framing fix — a
  // deliberate, reviewed change to cropping and card-art rendering itself,
  // not scope creep from an unrelated feature (same precedent as the
  // Shopify hash update noted below).
  'src/lib/photo-geometry.ts': 'a1222b902b3d305c5ee4b8f8da34b4c24c715ef9f50147abfd67b1a0e64c5a8e',
  // Updated for the player-position simplification, then for the
  // Hollinwood typography correction, its generalisation to a shared
  // nameplate module, that module's extension to the kit number, and a
  // fix for a confirmed defect in that number treatment, a sixth for a
  // separate confirmed position-anchoring defect, and a seventh for the
  // Custom Collection group-centring amendment — see card-lifecycle-
  // protected-areas.test.ts's own comment for the full reasoning.
  // Updated for the new Crimson Custom Collection template (one new import,
  // one new front-dispatch branch) — see card-lifecycle-protected-areas.
  // test.ts's own comment for the full reasoning.
  'src/components/builder/emblem/CardArt.tsx': '00dd6cd46fa0a0269844358bf5bb7ea2f0e5db99da7c3a4ce6b629dbc1405f5a',
  'src/lib/pricing-quote.ts': 'e1797bcc528074c53f6adb44b017b8e5b9b23a2154957faa999adac38fe815ee',
  'src/lib/pricing-engine.ts': 'e2f40e6defa8b779456ddd4b8ac4fc0578d650b4d96c7102bc05097c1a6ce454',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
};
// src/lib/shopify.ts and src/app/api/webhooks/shopify/orders-paid/route.ts
// were removed from this list for Gate 3 (direct Shopify checkout +
// server-verified payment) — the first legitimate, reviewed work since
// this hash was pinned to intentionally change either file.

describe('protected areas remain byte-identical after child-data erasure (migration 0076)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});
