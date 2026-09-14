export type HockeyPosition = 'G' | 'D' | 'C' | 'LW' | 'RW';

export type HockeyFrostChromeStats = {
  gp: string;
  g: string;
  a: string;
  pts?: string;
};

export const HOCKEY_FROST_CHROME_TEMPLATE_ID = 'hockey-frost-chrome';

export const HOCKEY_FROST_CHROME_PACK = {
  sport: 'hockey',
  collection: 'Frost Chrome',
  templateId: HOCKEY_FROST_CHROME_TEMPLATE_ID,
  positions: ['G', 'D', 'C', 'LW', 'RW'] as HockeyPosition[],
  frontStats: [
    { key: 'gp', label: 'GP' },
    { key: 'g', label: 'G' },
    { key: 'a', label: 'A' },
  ],
  backStats: [
    { key: 'gp', label: 'GP' },
    { key: 'g', label: 'G' },
    { key: 'a', label: 'A' },
    { key: 'pts', label: 'PTS' },
  ],
  rights: {
    publicSharing: false,
    reason: 'Incubator template. Keep sharing disabled until template rights and photo consent are reviewed.',
  },
} as const;

