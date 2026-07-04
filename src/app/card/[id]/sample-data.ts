export type ProfileStatus = 'draft' | 'pending_staff_review' | 'published';

export type ProfileBlock =
  | { type: 'stats'; items: { label: string; value: string }[] }
  | { type: 'text'; body: string }
  | { type: 'link'; label: string; url: string; style?: 'primary' | 'secondary' }
  | { type: 'links_row'; items: { label: string; url: string }[] };

export type SampleCardProfile = {
  id: string;
  name: string;
  subtitle: string; // e.g. "#00 · KINGS · POINT GUARD" or "Musician" or "Chief Experience Officer, Catapult"
  photo: string;
  blocks: ProfileBlock[];
  status: ProfileStatus;
  setupChoice: 'self_serve' | 'staff_done_for_you';
  chipProgrammed: boolean;
};

// Local-only sample data for previewing the /card/[id] page and the staff
// queue before any real database is wired up. Not used in production.
// `blocks` is intentionally generic — different products need very
// different profile content (sports stats vs. a musician's links vs. a
// professional's bio), not one fixed template.
export const SAMPLE_CARDS: Record<string, SampleCardProfile> = {
  'sample-1': {
    id: 'sample-1',
    name: 'Maya Cruz',
    subtitle: '#7 · EASTSIDE HAWKS · GUARD',
    photo: '/samples/player-jaylen.png',
    blocks: [
      { type: 'stats', items: [{ label: 'PTS', value: '18.2' }, { label: 'REB', value: '5.4' }, { label: 'AST', value: '6.1' }] },
      { type: 'text', body: 'Starting guard for the Eastside Hawks. Three-year varsity starter, league all-star 2025.' },
      { type: 'link', label: '▶ Watch Highlights', url: 'https://www.youtube.com/', style: 'primary' },
      { type: 'links_row', items: [{ label: 'Instagram', url: 'https://instagram.com/' }] },
    ],
    status: 'published',
    setupChoice: 'self_serve',
    chipProgrammed: true,
  },
  'sample-2': {
    id: 'sample-2',
    name: 'Dylan Friedman',
    subtitle: '#00 · KINGS · POINT GUARD',
    photo: '/last-shot/dylan-friedman-page1.png',
    blocks: [
      { type: 'stats', items: [{ label: 'PTS', value: '21.4' }, { label: 'REB', value: '4.0' }, { label: 'AST', value: '8.9' }] },
      { type: 'text', body: 'Point guard for the Kings, Nashville. Known for court vision and clutch free throws.' },
      { type: 'links_row', items: [{ label: 'Instagram', url: 'https://instagram.com/' }] },
    ],
    status: 'published',
    setupChoice: 'staff_done_for_you',
    chipProgrammed: true,
  },
  'sample-3': {
    id: 'sample-3',
    name: 'Jordan Patel',
    subtitle: '#14 · RIVERSIDE LIONS · STRIKER',
    photo: '/samples/player-jaylen.png',
    blocks: [{ type: 'stats', items: [{ label: 'GOALS', value: '—' }, { label: 'ASST', value: '—' }, { label: 'APPS', value: '—' }] }],
    status: 'pending_staff_review',
    setupChoice: 'staff_done_for_you',
    chipProgrammed: false,
  },
  // Non-sports example — same page, completely different content shape.
  // Demonstrates the "mini landing page" version: a musician's smart link.
  'sample-4': {
    id: 'sample-4',
    name: 'Sam',
    subtitle: 'Musician',
    photo: '/last-shot/caroline-valencia.png',
    blocks: [
      { type: 'text', body: 'New single out now. Tap below to listen, watch the unreleased clip, or follow for more.' },
      { type: 'link', label: '🎵 Listen on Spotify', url: 'https://open.spotify.com/', style: 'primary' },
      { type: 'link', label: '🔒 Unreleased clip — Circle members only', url: 'https://www.youtube.com/', style: 'secondary' },
      { type: 'links_row', items: [{ label: 'Instagram', url: 'https://instagram.com/' }, { label: 'TikTok', url: 'https://tiktok.com/' }] },
    ],
    status: 'published',
    setupChoice: 'staff_done_for_you',
    chipProgrammed: true,
  },
};
