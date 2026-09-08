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
  'src/lib/photo-geometry.ts': 'e9ba0a4045a9c2e239f6eb61a10a8f671bd4cc1242444e14cde83a9f0d014abf',
  'src/components/builder/emblem/CardArt.tsx': '6b1118a58e7efb26da3a595ac80b2c4895af4185af2a04b78833154756e1504c',
  'src/lib/print-capture.ts': '8226f6d51869e8ee98ab68ed4636ef4b248a2b9b546d63dd2413b36bdb83184d',
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
