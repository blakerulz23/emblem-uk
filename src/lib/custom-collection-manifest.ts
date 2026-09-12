export type CustomCollectionVariant = {
  id: CustomCollectionTemplateId;
  name: string;
  theme: string;
  description: string;
  accent: string;
  background: string;
  badgeBox?: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
  // Geometry (centre-x/bottom-y anchor, reference size, digit fit-scale) and
  // font are shared via the vertical nameplate system too — only fill,
  // outline colour/thickness, rotation and a shadow are ever per-variant
  // (see Comic's own numberBox for the one currently-justified case: a
  // deliberate tilted, thin-outlined "comic panel" treatment, not simply
  // unmeasured).
  numberBox?: {
    fillColor?: string;
    strokeColor?: string;
    outlineScale?: string;
    rotate?: string;
    shadow?: string;
    left?: string;
    top?: string;
    fontSize?: string;
  };
  // Geometry (left/top/width/fontSize) is shared across every card via the
  // vertical nameplate system (nameplate-typography.ts) — font family,
  // weight and rotation are fixed there too (Antonio Bold, rotate(-90deg)),
  // not overridable per variant, per the typography standard every card
  // uses. A variant sets any of these ONLY once a real measurement proves
  // its own nameplate genuinely differs from the shared default; `color` is
  // the one field variants are expected to set routinely, since colour
  // treatment (not geometry) is what actually varies card to card.
  positionBox?: {
    left?: string;
    top?: string;
    width?: string;
    fontSize?: string;
    color?: string;
  };
  nameBox?: {
    left?: string;
    top?: string;
    width?: string;
    fontSize?: string;
  };
  back?: {
    base: string;
    logoBox: {
      left: string;
      top: string;
      width: string;
      height: string;
    };
    nameBox: {
      left: string;
      top: string;
      width: string;
      fontSize?: string;
      fontFamily?: string;
      color?: string;
    };
  };
  assets: {
    preview: string;
    base?: string;
    background: string;
    frameOverlay?: string;
    railOverlay?: string;
    cornerOverlay?: string;
    teamLogoPosition?: string;
    emblemLogoPosition?: string;
    backBase?: string;
    emblemBurst?: string;
    numberBurst?: string;
  };
};

export type CustomCollectionTemplateId = 'custom-solar' | 'custom-galaxy' | 'custom-comic' | 'custom-crimson';

export const CUSTOM_COLLECTION_VARIANTS: readonly CustomCollectionVariant[] = [
  {
    id: 'custom-solar',
    name: 'Solar',
    theme: 'Solar Custom Collection',
    description: 'Warm orange custom football frame for any club, school or event',
    accent: '#8f5cff',
    background: '#070720',
    badgeBox: {
      left: '5.8%',
      top: '4.8%',
      width: '21.5%',
      height: '15.1%',
    },
    // nameBox intentionally omitted — measured to the same shared vertical
    // nameplate geometry every other card here uses (nameplate-typography.ts).
    //
    // positionBox.color: white, not purple. IMPORTANT — this `id:
    // 'custom-solar'` entry is the template whose real assets/accent are a
    // purple, starry, cosmic frame (background.png, accent #8f5cff, both
    // confirmed by direct pixel sampling) — i.e. the card the founder and
    // the supplied Canva reference both call "Galaxy". The `id:
    // 'custom-galaxy'` entry is a visually unrelated warm orange/red frame.
    // The `name`/`description`/`theme` string fields on this entry (and on
    // custom-galaxy's) are swapped relative to their own assets — a
    // pre-existing mismatch, confirmed but deliberately NOT fixed here (out
    // of scope for a colour-only change; the `id` is a stored identifier
    // other records may reference). White was requested explicitly,
    // reversing an earlier purple correction (#8f5cff, this entry's own
    // accent token) — matches name's own colour, keeps the restrained
    // shadow nameplateSlotStyle's `extra` already applies to every Custom
    // Collection position label, no separate outline. Scoped to exactly
    // this entry's positionBox — custom-galaxy and custom-comic are
    // untouched.
    positionBox: {
      color: '#fff',
    },
    // numberBox intentionally omitted — geometry shared, fill/stroke default
    // to white/positionColor (see CustomCollectionCardArt's own call site).
    back: {
      base: '/templates/custom-collection/solar/back-base.png',
      logoBox: {
        left: '50%',
        top: '10.5%',
        width: '20%',
        height: '14%',
      },
      nameBox: {
        left: '50%',
        top: '25%',
        width: '48%',
        fontSize: '0.12',
        fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
        color: '#fff',
      },
    },
    assets: {
      preview: '/templates/custom-collection/solar/preview.png',
      background: '/templates/custom-collection/solar/background.png',
      railOverlay: '/templates/custom-collection/solar/rail-overlay.png',
      cornerOverlay: '/templates/custom-collection/solar/corner-overlay.png',
      teamLogoPosition: '/templates/custom-collection/solar/team-logo-position.png',
      emblemLogoPosition: '/templates/custom-collection/solar/emblem-logo-position.png',
      backBase: '/templates/custom-collection/solar/back-background.png',
    },
  },
  {
    id: 'custom-galaxy',
    name: 'Galaxy',
    theme: 'Galaxy Custom Collection',
    description: 'Iridescent stadium frame for independent teams and one-off cards',
    accent: '#f16a31',
    background: '#17100b',
    badgeBox: {
      left: '5.8%',
      top: '4.8%',
      width: '21.5%',
      height: '15.1%',
    },
    // numberBox intentionally omitted — geometry shared, fill/stroke default
    // to white/positionColor.
    // nameBox/positionBox intentionally omitted — Galaxy measured to the
    // same shared vertical nameplate geometry every other card here uses
    // (nameplate-typography.ts); its position colour falls through to its
    // own template.accent (#f16a31), same as before.
    back: {
      base: '/templates/custom-collection/galaxy/back-base.png',
      logoBox: {
        left: '50%',
        top: '10.5%',
        width: '20%',
        height: '14%',
      },
      nameBox: {
        left: '50%',
        top: '25%',
        width: '48%',
        fontSize: '0.12',
        fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
        color: '#fff',
      },
    },
    assets: {
      preview: '/templates/custom-collection/galaxy/preview.png',
      base: '/templates/custom-collection/galaxy/base.png',
      background: '/templates/custom-collection/galaxy/background.png',
      railOverlay: '/templates/custom-collection/galaxy/rail-overlay.png',
      teamLogoPosition: '/templates/custom-collection/galaxy/team-logo-position.png',
      emblemLogoPosition: '/templates/custom-collection/galaxy/emblem-logo-position.png',
      backBase: '/templates/custom-collection/galaxy/back-background.png',
    },
  },
  {
    id: 'custom-comic',
    name: 'Comic',
    theme: 'Comic Custom Collection',
    description: 'Bold red comic-style football frame for schools, camps and tournaments',
    accent: '#ef2222',
    background: '#140202',
    badgeBox: {
      left: '5.8%',
      top: '4.8%',
      width: '21.5%',
      height: '15.1%',
    },
    // Deliberate "comic panel" treatment (solid white fill, thin dark
    // outline, slight tilt, hard drop shadow) — not simply an unmeasured
    // placeholder like every other numberBox that's now been removed: this
    // reads as a coherent, intentional style consistent with Comic's own
    // tilted corner watermark elsewhere on the same card. Geometry (centre-
    // x/bottom-y anchor, reference size, digit fit-scale) stays shared.
    numberBox: {
      fillColor: '#fff',
      strokeColor: '#111',
      outlineScale: '1.035',
      rotate: '-8deg',
      shadow: '0 3px 0 #111',
    },
    // nameBox intentionally omitted — Comic measured to the same shared
    // vertical nameplate geometry every other card here uses
    // (nameplate-typography.ts); only its position colour differs.
    positionBox: {
      color: '#ef2222',
    },
    back: {
      base: '/templates/custom-collection/comic/back-base.png',
      logoBox: {
        left: '50%',
        top: '10.5%',
        width: '20%',
        height: '14%',
      },
      nameBox: {
        left: '50%',
        top: '25%',
        width: '48%',
        fontSize: '0.12',
        fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
        color: '#fff',
      },
    },
    assets: {
      preview: '/templates/custom-collection/comic/reference.png',
      base: '/templates/custom-collection/comic/base.png',
      background: '/templates/custom-collection/comic/background.png',
      teamLogoPosition: '/templates/custom-collection/comic/team-logo-position.png',
      emblemLogoPosition: '/templates/custom-collection/comic/emblem-logo-position.png',
      cornerOverlay: '/templates/custom-collection/comic/corner-overlay.png',
      backBase: '/templates/custom-collection/comic/back-background.png',
    },
  },
  // Crimson's own artwork is a horizontal, centred name/position/number
  // layout (not the shared rotated-nameplate structure every other Custom
  // Collection card uses) — measured directly from the supplied reference
  // layers (alpha bounds on the shared 1050x1498 canvas): name and position
  // both centre at x≈50%, the kit number sits upper-left. Because its
  // geometry genuinely differs from NAMEPLATE_GEOMETRY/NAMEPLATE_NUMBER_
  // GEOMETRY, Crimson renders through its own dedicated CrimsonCardArt
  // component (see CardArt.tsx's `template.id === 'custom-crimson'` front
  // dispatch) rather than the shared CustomCollectionCardArt renderer — so
  // badgeBox/numberBox/positionBox/nameBox below are intentionally omitted;
  // CrimsonCardArt owns its own measured geometry constants instead.
  //
  // The supplied back artwork ("EVERY SEASON TELLS A STORY" / NFC tap-to-
  // open-Player-OS panel) has every word of its own text baked directly into
  // the flat image — no dynamic name/logo slot, the same shape as the
  // Champions family's own fully-static back (CardArt.tsx:
  // `side === 'back' && template.family === 'Champions'`, a flat
  // `/templates/champions/back.png` with zero dynamic overlays). `back` (the
  // logoBox/nameBox config) is therefore deliberately omitted here too —
  // inventing a logoBox/nameBox this art was never measured for would risk
  // covering part of its own baked artwork with a guessed overlay. Setting
  // only `assets.backBase` is enough: CustomCollectionCardBack's own fallback
  // (`back?.base || variant.assets.backBase || variant.assets.preview`)
  // resolves to this real back art directly, with no dynamic overlay drawn.
  //
  // KNOWN ISSUE, not fixed here (out of scope — this is baked-in raster
  // text in a supplied asset, not something this PR's code can safely edit):
  // this back art reads "EMBLEM.CARDS" — that's emblem.cards, the older,
  // separate product this codebase's own README/CLAUDE docs distinguish
  // from Emblem UK. Every other Custom Collection back (Solar/Galaxy/Comic's
  // own back-base.png, confirmed by direct inspection) instead reads "AN
  // EMBLEM COLLECTION". Flagged for the designer to correct at the source
  // art level; shipping as supplied rather than silently editing baked text.
  //
  // `preview` (the Custom Collection selector's own thumbnail, data.ts:
  // `bgPath: variant.assets.preview`) intentionally points at the plain
  // `base.png` frame art, NOT a composited reference/demo-card image. The
  // originally supplied `1.png`/`reference.png` composited a real-looking
  // stock player photo into the circular window — removed as a runtime
  // asset (never shipped through the public app) once identified as
  // containing what reads as an identifiable person; `base.png` has no
  // photo, no baked text, and was already a genuine runtime asset (the
  // `background` layer) — no new file was added to avoid shipping it.
  {
    id: 'custom-crimson',
    name: 'Crimson',
    theme: 'Crimson Custom Collection',
    description: 'Crimson and rose-gold football shield with a centred circular player portrait',
    accent: '#df3829',
    background: '#160301',
    assets: {
      preview: '/templates/custom-collection/crimson/base.png',
      background: '/templates/custom-collection/crimson/base.png',
      frameOverlay: '/templates/custom-collection/crimson/frame-overlay.png',
      emblemLogoPosition: '/templates/custom-collection/crimson/emblem-logo-position.png',
      backBase: '/templates/custom-collection/crimson/back-base.png',
    },
  },
] as const;

export const CUSTOM_COLLECTION_TEMPLATE_IDS = CUSTOM_COLLECTION_VARIANTS.map((variant) => variant.id);

export function isCustomCollectionTemplateId(id: string): id is CustomCollectionTemplateId {
  return CUSTOM_COLLECTION_TEMPLATE_IDS.includes(id as CustomCollectionTemplateId);
}

export function getCustomCollectionVariant(id: string) {
  return CUSTOM_COLLECTION_VARIANTS.find((variant) => variant.id === id) || CUSTOM_COLLECTION_VARIANTS[0];
}
