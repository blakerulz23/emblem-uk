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
  };
  positionBox?: {
    left: string;
    top: string;
    width?: string;
    fontSize?: string;
    fontFamily?: string;
    rotate?: string;
    color?: string;
  };
  nameBox?: {
    left: string;
    top: string;
    width?: string;
    fontSize?: string;
    fontFamily?: string;
    rotate?: string;
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
      left: '8.19%',
      top: '6.07%',
      width: '17.14%',
      height: '11.88%',
    },
    nameBox: {
      left: '10.1%',
      top: '66.8%',
      fontSize: '0.0855',
    },
    positionBox: {
      left: '18.3%',
      top: '58.9%',
      width: '13%',
      fontSize: '0.042',
    },
    numberBox: {
      left: '12.5%',
      top: '69.3%',
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
      left: '8.19%',
      top: '6.07%',
      width: '17.14%',
      height: '11.88%',
    },
    numberBox: {
      left: '6.2%',
      top: '69.3%',
      fontSize: '0.11244',
    },
    positionBox: {
      left: '18.3%',
      top: '58.9%',
      width: '13%',
      fontSize: '0.042',
    },
    nameBox: {
      left: '10.1%',
      top: '66.8%',
      fontSize: '0.0855',
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
      left: '8.19%',
      top: '6.07%',
      width: '17.14%',
      height: '11.88%',
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
    },
    positionBox: {
      left: '18.14%',
      top: '51.13%',
      width: '12.22%',
      fontSize: '0.0305',
      fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
      rotate: '-90deg',
      color: '#ef2222',
    },
    nameBox: {
      left: '12.33%',
      top: '51.5%',
      width: '31.44%',
      fontSize: '0.064',
      fontFamily: 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
      rotate: '-90deg',
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
