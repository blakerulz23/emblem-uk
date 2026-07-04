export type HollinwoodVariant = {
  id: string;
  name: string;
  theme: string;
  description: string;
  accent: string;
  background: string;
  clubName: string;
  assets: {
    frontBase: string;
    backBase: string;
    leagueBadge: string;
    clubBadge: string;
    positionTick: string;
    cornerRibbon: string;
    emblemMark: string;
  };
};

export const HOLLINWOOD_VARIANTS = [
  {
    id: 'hollinwood-blue',
    name: 'Blue',
    theme: 'Blue Official Player Card',
    description: 'Blue official football frame with Curzon Ashton Juniors artwork',
    accent: '#0074ff',
    background: '#071a38',
    clubName: 'Curzon Ashton Juniors',
    assets: {
      frontBase: '/templates/hollinwood-blue/background.png',
      backBase: '/templates/hollinwood-blue/back-background.png',
      leagueBadge: '/templates/hollinwood-blue/league-badge.png',
      clubBadge: '/templates/hollinwood-blue/club-badge-curzon.png',
      positionTick: '/templates/hollinwood-blue/position-tick.png',
      cornerRibbon: '/templates/hollinwood-blue/corner-ribbon.png',
      emblemMark: '/templates/hollinwood-blue/emblem-mark.png',
    },
  },
  {
    id: 'hollinwood-green',
    name: 'Green',
    theme: 'Green Official Player Card',
    description: 'Green official football frame with Trafford FC Youth artwork',
    accent: '#1f8f4d',
    background: '#092716',
    clubName: 'Trafford FC Youth',
    assets: {
      frontBase: '/templates/hollinwood-green/background.png',
      backBase: '/templates/hollinwood-green/back-background.png',
      leagueBadge: '/templates/hollinwood-green/league-badge.png',
      clubBadge: '/templates/hollinwood-green/club-badge-trafford.png',
      positionTick: '/templates/hollinwood-green/position-tick.png',
      cornerRibbon: '/templates/hollinwood-green/corner-ribbon.png',
      emblemMark: '/templates/hollinwood-blue/emblem-mark.png',
    },
  },
  {
    id: 'hollinwood-red',
    name: 'Red',
    theme: 'Red Official Player Card',
    description: 'Red official football frame with Ashton United artwork',
    accent: '#e42320',
    background: '#330807',
    clubName: 'Ashton United',
    assets: {
      frontBase: '/templates/hollinwood-red/background.png',
      backBase: '/templates/hollinwood-red/back-background.png',
      leagueBadge: '/templates/hollinwood-blue/league-badge.png',
      clubBadge: '/templates/hollinwood-red/club-badge-ashton.png',
      positionTick: '/templates/hollinwood-red/position-tick.png',
      cornerRibbon: '/templates/hollinwood-red/corner-ribbon.png',
      emblemMark: '/templates/hollinwood-blue/emblem-mark.png',
    },
  },
  {
    id: 'hollinwood-gold',
    name: 'Gold',
    theme: 'Gold Official Player Card',
    description: 'Gold official football frame with Saddleworth 3Ds artwork',
    accent: '#f2c400',
    background: '#342706',
    clubName: 'Saddleworth 3Ds',
    assets: {
      frontBase: '/templates/hollinwood-gold/background.png',
      backBase: '/templates/hollinwood-gold/back-background.png',
      leagueBadge: '/templates/hollinwood-blue/league-badge.png',
      clubBadge: '/templates/hollinwood-gold/club-badge-saddleworth.png',
      positionTick: '/templates/hollinwood-gold/position-tick.png',
      cornerRibbon: '/templates/hollinwood-gold/corner-ribbon.png',
      emblemMark: '/templates/hollinwood-blue/emblem-mark.png',
    },
  },
] as const satisfies readonly HollinwoodVariant[];

export type HollinwoodTemplateId = (typeof HOLLINWOOD_VARIANTS)[number]['id'];

export const HOLLINWOOD_TEMPLATE_IDS = HOLLINWOOD_VARIANTS.map((variant) => variant.id);

export function isHollinwoodTemplateId(id: string): id is HollinwoodTemplateId {
  return HOLLINWOOD_TEMPLATE_IDS.includes(id as HollinwoodTemplateId);
}

export function getHollinwoodVariant(id: string) {
  return HOLLINWOOD_VARIANTS.find((variant) => variant.id === id) || HOLLINWOOD_VARIANTS[0];
}
