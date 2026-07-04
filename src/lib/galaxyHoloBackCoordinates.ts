// All coordinates in GHB_W × GHB_H (1054 × 1492) space.
// Dynamic text is scaled to the render canvas at draw time via sx/sy.

export const GHB_W = 1054;
export const GHB_H = 1492;

export const GHB_LAYOUT = {
  // YC logo — full-canvas PNG positions itself; these values are the design reference
  logo:         { cx: 527, cy: 117, w: 113 },

  // "YOUTHCARDS" small brand label — sits below the logo
  brandLabel:   { cx: 527, cy: 228 },

  // Player name — large headline
  playerName:   { cx: 527, cy: 311 },

  // "POSITION  |  #NUMBER"
  posNumber:    { cx: 527, cy: 403 },

  // Top star divider (drawn by 04_back_divider_lines.png) — reference only
  topDivider:   { y: 476 },

  // "PLAYER STORY" section heading
  storyHeader:  { cx: 527, cy: 554 },

  // Bio / story paragraph
  storyText: {
    cx: 527,
    y:  646,
    w:  578,
    lineHeight: 39,
    maxLines:   4,
  },

  // Season stats — 3 columns
  statSection: {
    labelCY:    811,
    valueCY:    869,
    colCenters: [298, 527, 756] as [number, number, number],
    colWidth:   206,
  },

  // Profile table — rows computed from startY + rowHeight
  profileSection: {
    startY:   952,
    rowHeight: 53,
    iconX:    252,
    labelX:   324,
    valueX:   782,
  },

  // Bottom star divider (drawn by 04_back_divider_lines.png) — reference only
  bottomDivider: { y: 1253 },

  // NFC footer — handled by 07_back_footer_nfc.png
  nfcHeading: { cx: 527, cy: 1321 },
  nfcSubtext: { cx: 527, cy: 1369 },
};

// Three season stats per sport (back card)
export const GHB_BACK_SPORT_STATS: Record<string, { key: string; label: string }[]> = {
  baseball:   [{ key: 'avg',    label: 'AVG'   }, { key: 'rbi',     label: 'RBI' }, { key: 'hr',   label: 'HR'  }],
  basketball: [{ key: 'ppg',   label: 'PTS'   }, { key: 'rpg',     label: 'REB' }, { key: 'apg',  label: 'AST' }],
  soccer:     [{ key: 'goals', label: 'GOALS' }, { key: 'assists', label: 'AST' }, { key: 'apps', label: 'APP' }],
  football:   [{ key: 'yds',   label: 'YDS'   }, { key: 'td',      label: 'TD'  }, { key: 'tkl',  label: 'TCK' }],
};

export interface GhbProfileRowDef {
  label: string;
  cardField: string;
  statsKey?: string;
}

// Profile rows per sport — cardField maps to a CardData key,
// or cardField:'stats' + statsKey pulls from card.stats[statsKey]
export const GHB_SPORT_PROFILE: Record<string, GhbProfileRowDef[]> = {
  baseball: [
    { label: 'Age',           cardField: 'age' },
    { label: 'Class',         cardField: 'classYear' },
    { label: 'Height',        cardField: 'height' },
    { label: 'Hometown',      cardField: 'hometown' },
    { label: 'Bats / Throws', cardField: 'stats', statsKey: 'batsThrows' },
    { label: 'Team',          cardField: 'teamName' },
  ],
  basketball: [
    { label: 'Age',      cardField: 'age' },
    { label: 'Class',    cardField: 'classYear' },
    { label: 'Height',   cardField: 'height' },
    { label: 'Hometown', cardField: 'hometown' },
    { label: 'Position', cardField: 'position' },
    { label: 'Team',     cardField: 'teamName' },
  ],
  soccer: [
    { label: 'Age',      cardField: 'age' },
    { label: 'Class',    cardField: 'classYear' },
    { label: 'Height',   cardField: 'height' },
    { label: 'Hometown', cardField: 'hometown' },
    { label: 'Position', cardField: 'position' },
    { label: 'Team',     cardField: 'teamName' },
  ],
  football: [
    { label: 'Age',      cardField: 'age' },
    { label: 'Class',    cardField: 'classYear' },
    { label: 'Height',   cardField: 'height' },
    { label: 'Hometown', cardField: 'hometown' },
    { label: 'Position', cardField: 'position' },
    { label: 'Team',     cardField: 'teamName' },
  ],
};
