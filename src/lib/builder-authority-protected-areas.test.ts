import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Migration 0071 (the Adult Permission / guardian-approval safeguarding
 * work package) is explicitly required not to modify or affect background
 * removal, Gemini, /api/ai-mockup, IMG.LY, photo resizing/cropping, card
 * artwork generation, PDF generation, Squad Invite's existing behaviour, or
 * pricing/payment logic. This test proves the specific files that
 * implement those capabilities are byte-identical to their content as of
 * the moment this work package was implemented — the hashes below were
 * computed directly from those files before any 0071 code was written, via
 * `sha256sum <path>`, not guessed or derived from git history, so this
 * test has no runtime dependency on git state or network access.
 *
 * (No file in this codebase is literally named/branded "IMG.LY" — the
 * closest capability match is the crop/resize step applied during print
 * file capture, print-capture.ts, which is covered below alongside PDF
 * generation and card artwork generation.)
 *
 * Squad Invite's own protected files are covered separately by this
 * migration's own scoping (it creates only builder_* tables/functions,
 * touching zero squad_invite_* tables/functions/grants — see the
 * migration's own header comment) and by the existing Squad Invite test
 * suite, which this work package does not modify.
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
  'src/lib/print-capture.ts': 'e329ab40d2f67e3fdfa458f4c504e46bc9ebf8e9f5e98c337e9378cd95a08d07',
};

describe('protected areas remain byte-identical after the Adult Permission work package (migration 0071)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});
