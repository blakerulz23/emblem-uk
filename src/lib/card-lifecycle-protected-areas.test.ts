import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate 2 card suspension/revocation/replacement (migration 0075) is scoped
 * to cards.access_status, card_access_audit_events, the guardian/staff
 * lifecycle RPCs and routes, and NFC/public-profile resolution — nothing in
 * Gemini, background removal, /api/ai-mockup, cropping, card artwork, PDF/
 * print capture, pricing, Shopify, payments/fulfilment, or Squad Invite.
 * Hashes match the ones already pinned by hotfix-0073-protected-areas.test.ts
 * and dob-removal-protected-areas.test.ts (computed independently here via
 * `sha256sum`, not copied) — any future change on this branch that touches
 * one of these files should fail here and be treated as scope creep.
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
  // Updated for the Hollinwood name/position typography correction — Antonio
  // Bold font-load-readiness added to captureElementToPng, purely additive
  // and independent of PR #78's object-fit neutralisation below it (see
  // print-capture.ts's own doc comment on that function for the boundary).
  'src/lib/print-capture.ts': 'e329ab40d2f67e3fdfa458f4c504e46bc9ebf8e9f5e98c337e9378cd95a08d07',
  // Updated for the Auto-fit Player / zoom-out photo-framing fix — a
  // deliberate, reviewed change to cropping and card-art rendering itself,
  // not scope creep from an unrelated feature (same precedent as the
  // Shopify hash update noted below).
  'src/lib/photo-geometry.ts': 'a1222b902b3d305c5ee4b8f8da34b4c24c715ef9f50147abfd67b1a0e64c5a8e',
  // Updated for the player-position simplification (five customer-facing
  // categories replacing GK/RB/CB/etc on the card) — a deliberate, reviewed
  // change to card-art rendering itself, not scope creep from an unrelated
  // feature (same precedent as the Auto-fit Player hash update).
  //
  // Updated again for the Hollinwood name/position typography correction,
  // a third time to generalise that same measured geometry into a shared
  // module (src/lib/nameplate-typography.ts) used by Hollinwood, EMJFL and
  // all three Custom Collection variants, and a fourth time to extend that
  // same shared module to cover the kit number too, and a fifth time to
  // fix a confirmed defect in that number treatment: the original
  // -webkit-text-stroke width (calibrated purely to match the reference
  // PNG's outer alpha bounds) came out to ~63% of the font's em-size,
  // which swallowed the white interior of curved/enclosed digits (2, 0, 6,
  // 8, 9) into a solid coloured block on every card except Comic (which
  // already had its own much thinner override). Replaced with a layered-
  // copy technique (scaled coloured copy behind, true-size white copy on
  // top) that can't reproduce that failure mode by construction — verified
  // against real renders of every digit 0-9 on every unified card (see
  // nameplate-typography.ts's own doc comment and this PR's description
  // for the full topology measurements). Geometry/font/fit-scale rules
  // stay unified, colour and any card-specific effect (Comic's tilted,
  // thin-outlined number) stay local to each card's own render function.
  //
  // Updated a sixth time to fix a separate, confirmed position-anchoring
  // defect: position's own vertical anchor was a fixed, card-relative
  // constant, correct only for a name at least as long as the reference
  // pair (JACOB THOMPSON) — for anything shorter (e.g. TINUBU), the name's
  // own bottom-anchored, grows-upward span shrank well below position's
  // fixed anchor, leaving position floating above the name entirely.
  // Replaced with computeAdaptivePositionAnchor: position's anchor now
  // derives from the name's own estimated rendered length (one documented
  // proportional formula, not a per-string exception) — verified via real
  // rendering across the required name/position reproduction matrix, all
  // five canonical labels, one legacy label and the placeholder (see
  // nameplate-typography.ts's own doc comment and this PR's description
  // for the full before/after measurement table). RealCardArt/RealCardBack
  // and every back-face renderer remain untouched by any of these six
  // changes (verified via diff before this hash was touched each time).
  //
  // Updated a seventh time for the Custom Collection group-centring
  // amendment: EMJFL/Hollinwood's `positionAnchor` spread into
  // nameplateSlotStyle's overrides is now an explicit `{ top,
  // fontSizeFactor }` (avoids leaking computeAdaptivePositionAnchor's new
  // diagnostic `topEdgePct` field into merged geometry); EMJFL now passes
  // its own reverted vertical anchor (EMJFL_NAME_TOP_PCT) instead of the
  // shared, Hollinwood-calibrated default; CustomCollectionCardArt now
  // calls computeCustomCollectionGroupAnchor instead of
  // computeAdaptivePositionAnchor directly, with nameBoxOverride always
  // carrying the computed group top. Hollinwood's own resolved geometry is
  // unchanged (same shared default it always used); RealCardArt/RealCardBack
  // and every back-face renderer remain untouched (verified via diff).
  'src/components/builder/emblem/CardArt.tsx': 'a75fe36bed71b02a3e73022253a9e3e9f4f679d55d26d2390124b5f3b15dd4c7',
  'src/lib/pricing-quote.ts': 'e1797bcc528074c53f6adb44b017b8e5b9b23a2154957faa999adac38fe815ee',
  'src/lib/pricing-engine.ts': 'e2f40e6defa8b779456ddd4b8ac4fc0578d650b4d96c7102bc05097c1a6ce454',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
};
// src/lib/shopify.ts and src/app/api/webhooks/shopify/orders-paid/route.ts
// were removed from this list for Gate 3 (direct Shopify checkout +
// server-verified payment) — the first legitimate, reviewed work since
// this hash was pinned to intentionally change either file.

describe('protected areas remain byte-identical after card lifecycle controls (migration 0075)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});
