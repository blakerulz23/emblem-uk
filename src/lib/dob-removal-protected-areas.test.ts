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
  // Updated for the background-removal white-halo fix: alphaKeyWhite's RGB
  // was never corrected, only alpha — leaving semi-transparent hair-edge
  // pixels pinned near white (Gemini's cutout matte colour), visible as a
  // pale fringe on dark card templates. Added keyAndDecontaminateWhite,
  // exported as a pure function, doing an alpha-aware (not spatial-
  // adjacency-based — that approach was already tried and reverted here
  // for breaking a hard-edged photo) known-background colour recovery for
  // any pixel it makes non-opaque; the alpha ramp itself is unchanged.
  // Confirmed via real pixel measurement, a hard-edge simulation (0.0055%
  // of pixels touched, not a ~9px whole-silhouette band), and the real
  // CardArt/print-capture pipeline. No other file's protected scope touched.
  'src/components/builder/emblem/bgRemoval.ts': '637cb5e1f4c866e84b0edfa0bebf89daf183fecf448fea4b20d8d2ca8f77301c',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  // Updated for the Auto-fit Player / zoom-out photo-framing fix — a
  // deliberate, reviewed change to cropping and card-art rendering itself,
  // not scope creep from an unrelated feature.
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
