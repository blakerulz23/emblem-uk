import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Gate 2 exact-DOB removal (Stage A) is scoped to players.date_of_birth,
 * football_age_group's display, and the coach-fields UI/API — nothing in
 * background removal, Gemini, /api/ai-mockup, cropping, card artwork,
 * PDF/print capture, pricing/payment or Squad Invite. Pinned SHA-256
 * hashes prove these representative protected-area files are byte-
 * identical to what they were immediately after this migration package was
 * written — any future change to this branch that touches one of them
 * should fail here and be treated as scope creep, not a silent pass.
 */
const PROTECTED_FILES: Record<string, string> = {
  'src/components/builder/emblem/bgRemoval.ts': '3ce8418bb63b8215fde4a9f33dfd84761e477ee19161fbdd349ccf2fc9a23d2a',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  // Updated for the Auto-fit Player / zoom-out photo-framing fix — a
  // deliberate, reviewed change to cropping and card-art rendering itself,
  // not scope creep from an unrelated feature.
  'src/lib/photo-geometry.ts': 'a1222b902b3d305c5ee4b8f8da34b4c24c715ef9f50147abfd67b1a0e64c5a8e',
  // Updated for the player-position simplification, then again for the
  // Hollinwood typography correction and its generalisation to a shared
  // nameplate module — see card-lifecycle-protected-areas.test.ts's own
  // comment for the full reasoning.
  'src/components/builder/emblem/CardArt.tsx': 'ca7392d563cda1635d448002a76f436f5a23d6e65c89cd3e21fee3aa11e27dcf',
  // Updated for the Hollinwood typography correction — see card-lifecycle-
  // protected-areas.test.ts's own comment for the same reasoning.
  'src/lib/print-capture.ts': 'e329ab40d2f67e3fdfa458f4c504e46bc9ebf8e9f5e98c337e9378cd95a08d07',
  'src/lib/pricing-engine.ts': 'e2f40e6defa8b779456ddd4b8ac4fc0578d650b4d96c7102bc05097c1a6ce454',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
};

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('Gate 2 DOB removal — protected areas remain byte-identical', () => {
  for (const [path, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${path} is unchanged`, () => {
      expect(sha256(path)).toBe(expectedHash);
    });
  }
});
