import { CardTemplate } from './types';

export const TEMPLATES: CardTemplate[] = [
  // Baseball
  { id: 'baseball-holo', sport: 'baseball', style: 'galaxy-holo', name: 'Galaxy Holo', description: 'Premium holographic galaxy finish with iridescent cosmic effects' },
  { id: 'baseball-futuristic', sport: 'baseball', style: 'futuristic', name: 'Neon Diamond', description: 'Cyberpunk neon glow with angular diamond cuts' },
  { id: 'baseball-chrome', sport: 'baseball', style: 'chrome', name: 'Chrome Slugger', description: 'Brushed chrome finish with premium metallic borders' },
  // Basketball
  { id: 'basketball-holo', sport: 'basketball', style: 'galaxy-holo', name: 'Galaxy Holo', description: 'Premium holographic galaxy finish with iridescent cosmic effects' },
  { id: 'basketball-futuristic', sport: 'basketball', style: 'futuristic', name: 'Neon Court', description: 'Electric neon glow with futuristic court elements' },
  { id: 'basketball-chrome', sport: 'basketball', style: 'chrome', name: 'Chrome Dunk', description: 'Heavy chrome finish with metallic rim details' },
  // Soccer
  { id: 'soccer-holo', sport: 'soccer', style: 'galaxy-holo', name: 'Galaxy Holo', description: 'Premium holographic galaxy finish with iridescent cosmic effects' },
  { id: 'soccer-futuristic', sport: 'soccer', style: 'futuristic', name: 'Neon Pitch', description: 'Glowing neon field lines with tech aesthetic' },
  { id: 'soccer-chrome', sport: 'soccer', style: 'chrome', name: 'Chrome Strike', description: 'Premium metallic with chrome ball textures' },
  // Football
  { id: 'football-holo', sport: 'football', style: 'galaxy-holo', name: 'Galaxy Holo', description: 'Premium holographic galaxy finish with iridescent cosmic effects' },
  { id: 'football-futuristic', sport: 'football', style: 'futuristic', name: 'Neon Blitz', description: 'Electric neon with angular helmet silhouettes' },
  { id: 'football-chrome', sport: 'football', style: 'chrome', name: 'Chrome Rush', description: 'Heavy metal finish with gridiron detailing' },
  // Chrome Legacy
  { id: 'baseball-chrome-legacy',    sport: 'baseball',    style: 'chrome-legacy', name: 'Chrome Legacy', description: 'Premium layered chrome with stadium atmosphere and brushed metal finish' },
  { id: 'basketball-chrome-legacy',  sport: 'basketball',  style: 'chrome-legacy', name: 'Chrome Legacy', description: 'Premium layered chrome with stadium atmosphere and brushed metal finish' },
  { id: 'soccer-chrome-legacy',      sport: 'soccer',      style: 'chrome-legacy', name: 'Chrome Legacy', description: 'Premium layered chrome with stadium atmosphere and brushed metal finish' },
  { id: 'football-chrome-legacy',    sport: 'football',    style: 'chrome-legacy', name: 'Chrome Legacy', description: 'Premium layered chrome with stadium atmosphere and brushed metal finish' },
];

export function getTemplatesForSport(sport: string): CardTemplate[] {
  return TEMPLATES.filter((t) => t.sport === sport);
}
