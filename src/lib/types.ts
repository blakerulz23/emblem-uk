export type Sport = 'baseball' | 'basketball' | 'soccer' | 'football';

export type TemplateStyle = 'holo' | 'futuristic' | 'chrome' | 'galaxy-holo' | 'chrome-legacy';

export interface CardTemplate {
  id: string;
  sport: Sport;
  style: TemplateStyle;
  name: string;
  description: string;
}

export interface CardData {
  sport: Sport | null;
  template: CardTemplate | null;
  playerName: string;
  teamName: string;
  jerseyNumber: string;
  position: string;
  accentColor: string;
  secondaryColor: string;
  playerPhoto: string | null;
  teamLogo: string | null;
  photoOffsetX: number;
  photoOffsetY: number;
  photoScale: number;
  // Back side customization
  showStats: boolean;
  stats: Record<string, string>;
  backText: string;
  backPhoto: string | null;
  backPhotoOffsetX: number;
  backPhotoOffsetY: number;
  backPhotoScale: number;
  // Physical player info (futuristic back)
  height: string;
  age: string;
  classYear: string;
  hometown: string;
}

export interface OrderData {
  quantity: number;
  packType: 'single' | 'team' | 'league';
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export const SPORT_STATS: Record<Sport, { key: string; label: string; placeholder: string }[]> = {
  baseball: [
    { key: 'avg', label: 'AVG', placeholder: '.350' },
    { key: 'hr', label: 'HR', placeholder: '12' },
    { key: 'rbi', label: 'RBI', placeholder: '45' },
    { key: 'sb', label: 'SB', placeholder: '15' },
    { key: 'ops', label: 'OPS', placeholder: '.920' },
    { key: 'era', label: 'ERA', placeholder: '3.25' },
  ],
  basketball: [
    { key: 'ppg', label: 'PPG', placeholder: '18.5' },
    { key: 'rpg', label: 'RPG', placeholder: '7.2' },
    { key: 'apg', label: 'APG', placeholder: '4.1' },
    { key: 'spg', label: 'SPG', placeholder: '1.8' },
    { key: 'bpg', label: 'BPG', placeholder: '0.9' },
    { key: 'ftpct', label: 'FT%', placeholder: '82' },
  ],
  soccer: [
    { key: 'goals', label: 'Goals', placeholder: '14' },
    { key: 'assists', label: 'Assists', placeholder: '8' },
    { key: 'apps', label: 'Apps', placeholder: '20' },
    { key: 'passes', label: 'Pass%', placeholder: '87' },
    { key: 'tackles', label: 'Tackles', placeholder: '23' },
    { key: 'saves', label: 'Saves', placeholder: '0' },
  ],
  football: [
    { key: 'td', label: 'TD', placeholder: '8' },
    { key: 'yds', label: 'YDS', placeholder: '1250' },
    { key: 'rec', label: 'REC', placeholder: '32' },
    { key: 'tkl', label: 'TKL', placeholder: '45' },
    { key: 'int', label: 'INT', placeholder: '3' },
    { key: 'sacks', label: 'Sacks', placeholder: '5' },
  ],
};

export const SPORT_POSITIONS: Record<Sport, string[]> = {
  baseball: ['Pitcher', 'Catcher', 'First Base', 'Second Base', 'Third Base', 'Shortstop', 'Left Field', 'Center Field', 'Right Field'],
  basketball: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  soccer: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Striker', 'Winger'],
  football: ['Quarterback', 'Running Back', 'Wide Receiver', 'Tight End', 'Linebacker', 'Cornerback', 'Safety', 'Defensive End'],
};

export const SPORT_INFO: Record<Sport, { label: string; icon: string; color: string }> = {
  baseball: { label: 'Baseball', icon: '⚾', color: '#DC2626' },
  basketball: { label: 'Basketball', icon: '🏀', color: '#EA580C' },
  soccer: { label: 'Soccer', icon: '⚽', color: '#16A34A' },
  football: { label: 'Football', icon: '🏈', color: '#7C3AED' },
};
