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
  'src/components/builder/emblem/bgRemoval.ts': '185afdfc5bc678fa11f648108b1aed5448c9c5e91d69e90018098e2791f63e79',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  'src/lib/photo-geometry.ts': '978e82969fed90ff88d0129e9aebff8da8fea49fc5ea15a7c403bacfd5c98645',
  'src/components/builder/emblem/CardArt.tsx': '6b1118a58e7efb26da3a595ac80b2c4895af4185af2a04b78833154756e1504c',
  'src/lib/print-capture.ts': '193d00d664d72b992595ed02b0b98dcba1430153822d6cb6a821dc9773e5e303',
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
