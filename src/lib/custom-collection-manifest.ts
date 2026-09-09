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
  numberBox?: {
    left: string;
    top: string;
    fontSize?: string;
    fontFamily?: string;
    rotate?: string;
    color?: string;
    stroke?: string;
    shadow?: string;
    fontStyle?: string;
    fontWeight?: string;
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

export type CustomCollectionTemplateId = 'custom-solar' | 'custom-galaxy' | 'custom-comic';

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
    // nameBox/positionBox intentionally omitted — Solar measured to the
    // same shared vertical nameplate geometry every other card here uses
    // (nameplate-typography.ts); only its position colour differs.
    positionBox: {
      color: '#ef2222',
    },
    numberBox: {
      left: '10.3%',
      top: '69.3%',
      fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
      fontWeight: '400',
    },
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
    numberBox: {
      left: '6.2%',
      top: '69.3%',
      fontSize: '0.11244',
      fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
      fontWeight: '400',
    },
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
    numberBox: {
      left: '14%',
      top: '75.77%',
      fontSize: '0.1295',
      fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
      rotate: '0deg',
      color: '#fff',
      stroke: '#111',
      shadow: '0 3px 0 #111',
      fontStyle: 'normal',
      fontWeight: '400',
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
] as const;

export const CUSTOM_COLLECTION_TEMPLATE_IDS = CUSTOM_COLLECTION_VARIANTS.map((variant) => variant.id);

export function isCustomCollectionTemplateId(id: string): id is CustomCollectionTemplateId {
  return CUSTOM_COLLECTION_TEMPLATE_IDS.includes(id as CustomCollectionTemplateId);
}

export function getCustomCollectionVariant(id: string) {
  return CUSTOM_COLLECTION_VARIANTS.find((variant) => variant.id === id) || CUSTOM_COLLECTION_VARIANTS[0];
}
