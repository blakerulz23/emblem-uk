// Typography and color config for Galaxy Holo back card.
// All size values are in GHB_W × GHB_H (1054 × 1492) space — scaled at draw time.

export const GHB_THEME = {
  brand: {
    size: 21,
    color: '#4B5563',
    letterSpacing: 11,
  },
  playerName: {
    size: 70,
    color: '#111827',
    maxWidth: 926,
    letterSpacing: 3,
  },
  positionNumber: {
    size: 27,
    color: '#374151',
    letterSpacing: 7,
  },
  sectionLabel: {
    size: 33,
    color: '#4B5563',
    letterSpacing: 13,
  },
  storyText: {
    size: 27,
    color: '#374151',
    lineHeight: 39,
  },
  statLabel: {
    size: 25,
    color: '#6B7280',
  },
  statValue: {
    size: 54,
    color: '#111827',
  },
  profileLabel: {
    size: 25,
    color: '#6B7280',
  },
  profileValue: {
    size: 25,
    color: '#111827',
  },
} as const;
