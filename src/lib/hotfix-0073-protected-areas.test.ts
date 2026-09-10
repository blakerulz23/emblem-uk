import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Security hotfix 0073 (restrict authenticated column access to
 * cards.claim_token; renumbered from 0072 to 0073 after migrations 0071
 * and 0072 were released separately through PR #36) is explicitly required
 * not to touch background removal, Gemini, /api/ai-mockup, IMG.LY/cropping,
 * card artwork, PDF generation, print capture, pricing, Shopify, payments,
 * fulfilment, or Squad Invite. This is a standalone hash-pinned proof for
 * this branch (cut directly from origin/main, independent of PR #36's own
 * protected-areas test) — hashes were computed directly from these files
 * before any hotfix code was written, via `sha256sum <path>`, not guessed
 * or derived from git history.
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
  'src/lib/pricing-quote.ts': 'e1797bcc528074c53f6adb44b017b8e5b9b23a2154957faa999adac38fe815ee',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
};
// src/lib/shopify.ts and src/app/api/webhooks/shopify/orders-paid/route.ts
// were removed from this list for Gate 3 (direct Shopify checkout +
// server-verified payment) — the first legitimate, reviewed work since
// this hash was pinned to intentionally change either file. Every other
// entry above still proves Gate 3 itself never touches background
// removal, Gemini, print/PDF generation, pricing, or Squad Invite.

describe('protected areas remain byte-identical after the card claim-token hotfix (migration 0073)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});
