// Emblem builder data — adds Plushies + Bobbleheads as real products,
// and adds an 'ai' option to jewelry/keychain/pin/magnet shape selectors.

import { HOLLINWOOD_VARIANTS } from '@/lib/hollinwood-manifest';
import { CUSTOM_COLLECTION_VARIANTS } from '@/lib/custom-collection-manifest';
export { DEFAULT_EMJFL_CLUB, EMJFL_CLUBS, type EmjflClub } from '@/lib/emjfl-clubs';

export type ProductId =
  | 'cards'
  | 'posters'
  | 'wristbands'
  | 'stickers'
  | 'keychains'
  | 'jewelry'
  | 'pins'
  | 'magnets'
  | 'plushies'
  | 'bobbleheads'
  | 'figurinez'
  | 'puzzles'
  | 'pendants'
  | 'coins'
  | 'armymen'
  | 'rushmore';
export type StepKey = 'upload' | 'magic' | 'product' | 'gallery' | 'edit' | 'review';

export type Product = {
  id: ProductId;
  name: string;
  icon: IconName;
  tag: string;
  blurb: string;
  price: number;
  hidden?: boolean;
  hero?: boolean;
};

export type Family = 'Prism' | 'Carbon' | 'Aurora' | 'Clean' | 'Spectrum' | 'Mono' | 'Futuristic' | 'Chrome' | 'Galaxy' | 'Vintage' | 'Champions' | 'EMJFL' | 'Hollinwood' | 'Custom';

export type CardTemplate = {
  id: string;
  family: Family;
  name: string;
  theme: string;
  accent: string;
  n: number;
  // Real PNG template assets — present for Futuristic / Chrome / Galaxy families
  bgPath?: string;
  framePath?: string;
  nameplatePath?: string;
  badgePath?: string;
  topBannerPath?: string;
  nfcIconPath?: string;
  statPanelPath?: string;
};

export type Details = {
  name: string;
  number: string;
  team: string;
  position: string;
};

export type SportId = 'baseball' | 'basketball' | 'soccer' | 'football';

export const SPORTS: { id: SportId; label: string; emoji: string }[] = [
  { id: 'basketball', label: 'Basketball', emoji: '🏀' },
  { id: 'baseball',   label: 'Baseball',   emoji: '⚾' },
  { id: 'soccer',     label: 'Soccer',     emoji: '⚽' },
  { id: 'football',   label: 'Football',   emoji: '🏈' },
];

export const SPORT_STATS: Record<SportId, { key: string; label: string }[]> = {
  baseball:   [{ key: 'avg', label: 'AVG' }, { key: 'rbi', label: 'RBI' }, { key: 'hr', label: 'HR' }],
  basketball: [{ key: 'ppg', label: 'PTS' }, { key: 'rpg', label: 'REB' }, { key: 'apg', label: 'AST' }],
  soccer:     [{ key: 'goals', label: 'GOALS' }, { key: 'assists', label: 'ASST' }, { key: 'apps', label: 'APPS' }],
  football:   [{ key: 'yds', label: 'YDS' }, { key: 'td', label: 'TD' }, { key: 'tkl', label: 'TCK' }],
};

export type PhysicalKey = 'height' | 'age' | 'classYear' | 'hometown';

export type IconName =
  | 'upload' | 'camera' | 'sparkle' | 'check' | 'chevR' | 'chevL' | 'chevD'
  | 'plus' | 'minus' | 'cart' | 'nfc' | 'image' | 'layers' | 'grid'
  | 'poster' | 'wrist' | 'sticker' | 'key' | 'bobble' | 'jewelry' | 'star'
  | 'refresh' | 'edit' | 'shield' | 'truck' | 'close' | 'trash' | 'text' | 'logo' | 'mark'
  | 'circle' | 'rect' | 'slab' | 'necklace' | 'bracelet' | 'pin' | 'magnet' | 'plush' | 'warn';

export const PRODUCTS: Product[] = [
  { id: 'cards',       name: 'Trading Cards', icon: 'grid',     tag: '24 designs',          blurb: 'NFC-tap premium cards',           price: 24, hero: true },
  { id: 'posters',     name: 'Posters',       icon: 'poster',   tag: '6 sizes',             blurb: 'Matte & gloss, up to 24×36"',     price: 32 },
  { id: 'puzzles',     name: 'Puzzles',       icon: 'grid',     tag: '100 pieces',          blurb: 'Custom photo jigsaw, 330×420mm',  price: 47 },
  { id: 'stickers',    name: 'Stickers',      icon: 'sticker',  tag: 'Die-cut',             blurb: 'Weatherproof vinyl pack',         price: 9  },
  { id: 'keychains',   name: 'Keychains',     icon: 'key',      tag: '3 shapes',            blurb: 'Acrylic, 3" double-sided',        price: 12 },
  { id: 'wristbands',  name: 'Wristbands',    icon: 'wrist',    tag: 'NFC patch',           blurb: 'Elastic band w/ tap patch',       price: 14 },
  { id: 'jewelry',     name: 'Jewelry',       icon: 'jewelry',  tag: 'Necklace + bracelet', blurb: 'Stainless charm + chain',         price: 24 },
  { id: 'pins',        name: 'Pins',          icon: 'pin',      tag: '2 shapes',            blurb: 'Enamel pin · 1.25" backing',      price: 6 },
  { id: 'magnets',     name: 'Magnets',       icon: 'magnet',   tag: '2 shapes',            blurb: 'Photo magnet · fridge-friendly',  price: 8 },
  { id: 'plushies',    name: 'Plushies',      icon: 'plush',    tag: '14-day turnaround',   blurb: 'Plush keychain · hand-sewn',       price: 36 },
  { id: 'bobbleheads', name: 'Bobbleheads',   icon: 'bobble',   tag: '3D printed',          blurb: 'Hand-painted figurine · 7" tall',  price: 79 },
  { id: 'figurinez',   name: 'Figurinez',     icon: 'bobble',   tag: '3D printed',          blurb: 'Hand-painted figurine · 7" tall',  price: 79 },
];

export const PRODUCT_ORDER: ProductId[] = PRODUCTS.map((p) => p.id);

// Whether a product needs the upfront athlete photo (Upload → Magic) before
// reaching its editor. Plushies + Bobbleheads use the upfront photo as input
// to the AI mockup.
export const PRODUCT_NEEDS_PHOTO: Record<ProductId, boolean> = {
  cards:       true,
  posters:     true,
  stickers:    true,
  keychains:   true,
  pins:        true,
  magnets:     true,
  plushies:    true,
  bobbleheads: true,
  figurinez:   true,
  puzzles:     true,
  pendants:    true,
  coins:       true,
  armymen:     true,
  rushmore:    true,
  wristbands:  false,
  jewelry:     false,
};

export const FAMILIES: Family[] = ['Futuristic', 'Chrome', 'Galaxy', 'Prism', 'Carbon', 'Aurora', 'Clean', 'Spectrum', 'Mono'];

export const ACCENTS = [
  { id: 'citrus', name: 'Citrus', c: '#FF5A1F' },
  { id: 'cobalt', name: 'Cobalt', c: '#2563EB' },
  { id: 'mint',   name: 'Mint',   c: '#0EA66B' },
  { id: 'violet', name: 'Violet', c: '#7C3AED' },
] as const;

function buildTemplates(): CardTemplate[] {
  const out: CardTemplate[] = [];
  FAMILIES.forEach((fam, fi) => {
    ACCENTS.forEach((a, ai) => {
      out.push({
        id: `${fam.toLowerCase()}-${a.id}`,
        family: fam,
        name: fam,
        theme: a.name,
        accent: a.c,
        n: fi * 4 + ai + 1,
      });
    });
  });
  return out;
}

const PROCEDURAL_TEMPLATES: CardTemplate[] = buildTemplates();

// ── Real PNG templates ───────────────────────────────────────────────────────

const FUTURISTIC_VARIANTS = [
  { name: 'gold',          hex: '#C8A84B', label: 'Gold'          },
  { name: 'electric-blue', hex: '#1450FF', label: 'Electric Blue' },
  { name: 'neon-cyan',     hex: '#00E6FF', label: 'Neon Cyan'     },
  { name: 'deep-purple',   hex: '#9100FF', label: 'Deep Purple'   },
  { name: 'neon-green',    hex: '#00FF37', label: 'Neon Green'    },
  { name: 'hot-pink',      hex: '#FF00A0', label: 'Hot Pink'      },
  { name: 'crimson',       hex: '#FF0F28', label: 'Crimson'       },
  { name: 'orange',        hex: '#FF5F00', label: 'Orange'        },
  { name: 'lime',          hex: '#9BFF00', label: 'Lime'          },
  { name: 'teal',          hex: '#00D2AF', label: 'Teal'          },
  { name: 'indigo',        hex: '#4B00FF', label: 'Indigo'        },
  { name: 'rose',          hex: '#FF2D6E', label: 'Rose'          },
  { name: 'sky-blue',      hex: '#23AFFF', label: 'Sky Blue'      },
  { name: 'emerald',       hex: '#00C85A', label: 'Emerald'       },
  { name: 'bronze',        hex: '#CD731E', label: 'Bronze'        },
  { name: 'silver',        hex: '#BECDE6', label: 'Silver'        },
  { name: 'violet',        hex: '#B900FF', label: 'Violet'        },
  { name: 'coral',         hex: '#FF4B37', label: 'Coral'         },
  { name: 'mint',          hex: '#5AFFC3', label: 'Mint'          },
  { name: 'ice',           hex: '#8CD7FF', label: 'Ice'           },
] as const;

const FUTURISTIC_TEMPLATES: CardTemplate[] = FUTURISTIC_VARIANTS.map((v, i) => ({
  id: `futuristic-${v.name}`,
  family: 'Futuristic' as Family,
  name: 'Futuristic',
  theme: v.label,
  accent: v.hex,
  n: i + 1,
  bgPath:         `/templates/futuristic/variants/background-${v.name}.png`,
  framePath:      '/templates/futuristic/frame.png',
  nameplatePath:  '/templates/futuristic/nameplate.png',
  badgePath:      '/templates/futuristic/badge.png',
  topBannerPath:  '/templates/futuristic/top-banner.png',
  nfcIconPath:    '/templates/futuristic/nfc-icon.png',
  statPanelPath:  '/templates/futuristic/stat-panel.png',
}));

const CHROME_VARIANTS = [
  { name: 'blue',          hex: '#2563EB', label: 'Blue'          },
  { name: 'bronze',        hex: '#CD731E', label: 'Bronze'        },
  { name: 'coral',         hex: '#FF4B37', label: 'Coral'         },
  { name: 'crimson',       hex: '#FF0F28', label: 'Crimson'       },
  { name: 'cyan',          hex: '#00E6FF', label: 'Cyan'          },
  { name: 'deep-purple',   hex: '#9100FF', label: 'Deep Purple'   },
  { name: 'electric-blue', hex: '#1450FF', label: 'Electric Blue' },
  { name: 'emerald',       hex: '#00C85A', label: 'Emerald'       },
  { name: 'gold',          hex: '#C8A84B', label: 'Gold'          },
  { name: 'green',         hex: '#00C85A', label: 'Green'         },
  { name: 'hot-pink',      hex: '#FF00A0', label: 'Hot Pink'      },
  { name: 'ice',           hex: '#8CD7FF', label: 'Ice'           },
  { name: 'indigo',        hex: '#4B00FF', label: 'Indigo'        },
  { name: 'lime',          hex: '#9BFF00', label: 'Lime'          },
  { name: 'mint',          hex: '#5AFFC3', label: 'Mint'          },
  { name: 'neon-cyan',     hex: '#00E6FF', label: 'Neon Cyan'     },
  { name: 'neon-green',    hex: '#00FF37', label: 'Neon Green'    },
  { name: 'orange',        hex: '#FF5F00', label: 'Orange'        },
  { name: 'pink',          hex: '#FF4FB8', label: 'Pink'          },
  { name: 'purple',        hex: '#7C3AED', label: 'Purple'        },
  { name: 'rose',          hex: '#FF2D6E', label: 'Rose'          },
  { name: 'silver',        hex: '#BECDE6', label: 'Silver'        },
  { name: 'sky-blue',      hex: '#23AFFF', label: 'Sky Blue'      },
  { name: 'teal',          hex: '#00D2AF', label: 'Teal'          },
  { name: 'violet',        hex: '#B900FF', label: 'Violet'        },
  { name: 'white',         hex: '#F8FAFC', label: 'White'         },
] as const;

const CHROME_TEMPLATES: CardTemplate[] = CHROME_VARIANTS.map((v, i) => ({
  id: `chrome-legacy-${v.name}`,
  family: 'Chrome' as Family,
  name: 'Chrome Legacy',
  theme: v.label,
  accent: v.hex,
  n: i + 1,
  bgPath:        `/templates/chrome-legacy/variants/bg-stadium-${v.name}.png`,
  framePath:     '/templates/chrome-legacy/chrome-legacy-frame.png',
  nameplatePath: '/templates/chrome-legacy/chrome-legacy-nameplate-overlay.png',
  badgePath:     '/templates/chrome-legacy/chrome-legacy-top-badge.png',
  topBannerPath: '/templates/chrome-legacy/chrome-legacy-bottom-plate.png',
  nfcIconPath:   '/templates/chrome-legacy/chrome-legacy-nfc-tab.png',
  statPanelPath: '/templates/chrome-legacy/chrome-legacy-stat-box-frame.png',
}));

const GALAXY_VARIANTS = [
  { name: 'blue',          hex: '#2563EB', label: 'Blue'          },
  { name: 'bronze',        hex: '#CD731E', label: 'Bronze'        },
  { name: 'coral',         hex: '#FF4B37', label: 'Coral'         },
  { name: 'crimson',       hex: '#FF0F28', label: 'Crimson'       },
  { name: 'cyan',          hex: '#00E6FF', label: 'Cyan'          },
  { name: 'deep-purple',   hex: '#9100FF', label: 'Deep Purple'   },
  { name: 'electric-blue', hex: '#1450FF', label: 'Electric Blue' },
  { name: 'emerald',       hex: '#00C85A', label: 'Emerald'       },
  { name: 'gold',          hex: '#C8A84B', label: 'Gold'          },
  { name: 'green',         hex: '#00C85A', label: 'Green'         },
  { name: 'hot-pink',      hex: '#FF00A0', label: 'Hot Pink'      },
  { name: 'ice',           hex: '#8CD7FF', label: 'Ice'           },
  { name: 'indigo',        hex: '#4B00FF', label: 'Indigo'        },
  { name: 'lime',          hex: '#9BFF00', label: 'Lime'          },
  { name: 'mint',          hex: '#5AFFC3', label: 'Mint'          },
  { name: 'neon-cyan',     hex: '#00E6FF', label: 'Neon Cyan'     },
  { name: 'neon-green',    hex: '#00FF37', label: 'Neon Green'    },
  { name: 'orange',        hex: '#FF5F00', label: 'Orange'        },
  { name: 'pink',          hex: '#FF4FB8', label: 'Pink'          },
  { name: 'purple',        hex: '#7C3AED', label: 'Purple'        },
  { name: 'rose',          hex: '#FF2D6E', label: 'Rose'          },
  { name: 'silver',        hex: '#BECDE6', label: 'Silver'        },
  { name: 'sky-blue',      hex: '#23AFFF', label: 'Sky Blue'      },
  { name: 'teal',          hex: '#00D2AF', label: 'Teal'          },
  { name: 'violet',        hex: '#B900FF', label: 'Violet'        },
  { name: 'white',         hex: '#F8FAFC', label: 'White'         },
] as const;

const GALAXY_TEMPLATES: CardTemplate[] = GALAXY_VARIANTS.map((v, i) => ({
  id: `galaxy-${v.name}`,
  family: 'Galaxy' as Family,
  name: 'Galaxy Holo',
  theme: v.label,
  accent: v.hex,
  n: i + 1,
  bgPath:         `/templates/galaxy-holo/variants/base-${v.name}.png`,
  framePath:      '/templates/galaxy-holo/02_frame.png',
  badgePath:      '/templates/galaxy-holo/05_stat_boxes.png',
  topBannerPath:  '/templates/galaxy-holo/04_bottom_ui.png',
  nfcIconPath:    '/templates/galaxy-holo/07_nfc_icon.png',
}));

const VINTAGE_TEMPLATES: CardTemplate[] = [
  {
    id: 'vintage-classic',
    family: 'Vintage' as Family,
    name: 'Vintage',
    theme: 'Classic',
    accent: '#E86E00',
    n: 1,
    bgPath: '/templates/vintage/background.png',
  },
];

const CHAMPIONS_TEMPLATES: CardTemplate[] = [
  {
    id: 'champions-world',
    family: 'Champions' as Family,
    name: 'Champions',
    theme: 'World',
    accent: '#E86E00',
    n: 1,
    bgPath: '/templates/champions/background.png',
  },
];

// ── EMJFL — East Manchester Junior Football League official player card ────
// Pure CSS/gradient render (no flattened PNG layers) — see CardArt.tsx.

const EMJFL_TEMPLATES: CardTemplate[] = [
  {
    id: 'emjfl-official',
    family: 'EMJFL' as Family,
    name: 'EMJFL',
    theme: 'Official Player Card',
    accent: '#FF4B1F',
    n: 1,
    bgPath: '/templates/emjfl/background.png',
  },
];

const HOLLINWOOD_TEMPLATES: CardTemplate[] = HOLLINWOOD_VARIANTS.map((variant, index) => ({
  id: variant.id,
  family: 'Hollinwood' as Family,
  name: 'Hollinwood',
  theme: variant.theme,
  accent: variant.accent,
  n: index + 1,
  bgPath: variant.assets.frontBase,
}));

const CUSTOM_COLLECTION_TEMPLATES: CardTemplate[] = CUSTOM_COLLECTION_VARIANTS.map((variant, index) => ({
  id: variant.id,
  family: 'Custom' as Family,
  name: variant.name,
  theme: variant.theme,
  accent: variant.accent,
  n: index + 1,
  bgPath: variant.assets.preview,
}));

export const CARD_TEMPLATES: CardTemplate[] = [
  ...FUTURISTIC_TEMPLATES,
  ...CHROME_TEMPLATES,
  ...GALAXY_TEMPLATES,
  ...VINTAGE_TEMPLATES,
  ...CHAMPIONS_TEMPLATES,
  ...EMJFL_TEMPLATES,
  ...HOLLINWOOD_TEMPLATES,
  ...CUSTOM_COLLECTION_TEMPLATES,
  ...PROCEDURAL_TEMPLATES,
];

export const REAL_FAMILIES: Family[] = ['Futuristic', 'Chrome', 'Galaxy', 'Vintage', 'Champions', 'EMJFL', 'Hollinwood', 'Custom'];
export const FUTURISTIC_TEMPLATE_IDS = FUTURISTIC_TEMPLATES.map(t => t.id);

export const SIZES: Record<ProductId, string[]> = {
  cards:       ['Credit Card Size', 'Sports Card Size'],
  posters:     ['12×18"', '18×24"', '24×36"'],
  wristbands:  ['Youth', 'Adult S/M', 'Adult L/XL'],
  stickers:    ['3" pack', '5" pack'],
  keychains:   ['3"'],
  jewelry:     ['One size'],
  pins:        ['1.25"'],
  magnets:     ['2.5"', '4"'],
  plushies:    ['6"'],
  bobbleheads: ['7"'],
  figurinez:   ['7"'],
  puzzles:     ['100 pieces'],
  pendants:    ['One size'],
  coins:       ['One size'],
  armymen:     ['6cm'],
  rushmore:    ['12cm'],
};

export const STEP_NAME: Record<StepKey, string> = {
  upload:  'Upload',
  magic:   'Cut-out',
  product: 'Product',
  gallery: 'Design',
  edit:    'Details',
  review:  'Review',
};

export const DEFAULT_FLOW: StepKey[] = ['upload', 'magic', 'product', 'gallery', 'edit', 'review'];

export function buildSteps(product: ProductId, deepLink = false): StepKey[] {
  const steps: StepKey[] = ['upload', 'magic', 'product'];
  if (product === 'cards' || product === 'posters' || product === 'stickers' || product === 'keychains' || product === 'magnets' || product === 'puzzles') steps.push('gallery');
  steps.push('edit', 'review');
  if (deepLink) {
    const idx = steps.indexOf('product');
    if (idx >= 0) steps.splice(idx, 1);
    if (!PRODUCT_NEEDS_PHOTO[product]) {
      for (const s of ['upload', 'magic'] as StepKey[]) {
        const i = steps.indexOf(s);
        if (i >= 0) steps.splice(i, 1);
      }
    }
  }
  return steps;
}

export const SAMPLE_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760">
      <defs>
        <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#46505f"/><stop offset="1" stop-color="#222934"/>
        </linearGradient>
        <radialGradient id="gl" cx="50%" cy="32%" r="55%">
          <stop offset="0" stop-color="#aab4c2" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#aab4c2" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="250" rx="220" ry="260" fill="url(#gl)"/>
      <g fill="url(#sk)">
        <circle cx="300" cy="232" r="118"/>
        <path d="M126 760c0-152 78-252 174-252s174 100 174 252z"/>
      </g>
      <circle cx="300" cy="232" r="118" fill="#39414e"/>
    </svg>`,
  );

// ─────────────────────────────────────────────────────────────
// Wristband
// ─────────────────────────────────────────────────────────────

export type WristbandPresetKind =
  | 'bold' | 'sans-soft' | 'display' | 'verse-ref' | 'serif-heavy'
  | 'script' | 'handwritten' | 'mono-block' | 'verse-full' | 'outline'
  | 'name' | 'number'
  | 'logo-scatter' | 'logo-repeat' | 'logo-centered' | 'logo-border';

export type WristbandPreset = {
  id: WristbandPresetKind;
  name: string;
  kind: 'text' | 'logo';
  defaultText?: string;
  helper?: string;
};

export const WRISTBAND_PRESETS: WristbandPreset[] = [
  { id: 'bold',         name: 'Bold',          kind: 'text', defaultText: 'GO HAWKS',         helper: 'Manrope 800 · up to 24 characters' },
  { id: 'sans-soft',    name: 'Sans soft',     kind: 'text', defaultText: 'Eastside Hawks',   helper: 'Manrope 700 · 24 chars' },
  { id: 'display',      name: 'Display',       kind: 'text', defaultText: 'TEAM HAWKS',       helper: 'Sora 800 · expansive · 16 chars' },
  { id: 'verse-ref',    name: 'Reference',     kind: 'text', defaultText: 'JOHN 3:16',        helper: 'Heavy block · 14 chars' },
  { id: 'serif-heavy',  name: 'Heavy serif',   kind: 'text', defaultText: 'Faith',            helper: 'Serif display italic · 20 chars' },
  { id: 'script',       name: 'Script',        kind: 'text', defaultText: 'Faith over fear',  helper: 'Brush italic · 28 chars' },
  { id: 'handwritten',  name: 'Handwritten',   kind: 'text', defaultText: 'made with love',   helper: 'Casual handwriting · 28 chars' },
  { id: 'mono-block',   name: 'Mono block',    kind: 'text', defaultText: 'TEAM // 2026',     helper: 'Monospace bold · 18 chars' },
  { id: 'verse-full',   name: 'Full verse',    kind: 'text', defaultText: 'For God so loved the world, that he gave his only begotten Son',  helper: 'Tiny justified body · 110 chars' },
  { id: 'outline',      name: 'Outline',       kind: 'text', defaultText: 'CHAMPIONS',        helper: 'Hollow outline letters · 14 chars' },
  { id: 'name',         name: 'Player name',   kind: 'text', defaultText: 'M. CRUZ',          helper: 'Bold sora · 14 chars' },
  { id: 'number',       name: 'Jersey #',      kind: 'text', defaultText: '7',                helper: '1–2 digits' },
  { id: 'logo-scatter',  name: 'Scatter',  kind: 'logo' },
  { id: 'logo-repeat',   name: 'Repeat',   kind: 'logo' },
  { id: 'logo-centered', name: 'Single',   kind: 'logo' },
  { id: 'logo-border',   name: 'Border',   kind: 'logo' },
];

export type WristbandColor = { id: string; name: string; bg: string; fg: string };

export const WRISTBAND_COLORS: WristbandColor[] = [
  { id: 'black',   name: 'Black',   bg: '#0b0b0f', fg: '#f5f5f7' },
  { id: 'white',   name: 'White',   bg: '#f4f4f7', fg: '#0b0b0f' },
  { id: 'red',     name: 'Red',     bg: '#dc2626', fg: '#ffffff' },
  { id: 'pink',    name: 'Pink',    bg: '#ec4899', fg: '#ffffff' },
  { id: 'navy',    name: 'Navy',    bg: '#1e3a8a', fg: '#ffffff' },
  { id: 'green',   name: 'Green',   bg: '#16a34a', fg: '#ffffff' },
  { id: 'purple',  name: 'Purple',  bg: '#7c3aed', fg: '#ffffff' },
  { id: 'orange',  name: 'Orange',  bg: '#ea580c', fg: '#ffffff' },
  { id: 'sky',     name: 'Sky',     bg: '#0ea5e9', fg: '#ffffff' },
  { id: 'mustard', name: 'Mustard', bg: '#d97706', fg: '#ffffff' },
];

export type LogoState = {
  src: string | null;
  processed: string | null;
  status: 'idle' | 'processing' | 'ready' | 'error';
  method?: 'imgly' | 'canvas' | 'gemini';
  error?: string;
};

export const EMPTY_LOGO: LogoState = { src: null, processed: null, status: 'idle' };

export type WristbandBand = {
  preset: WristbandPresetKind;
  colorId: string;
  text: string;
  logo: LogoState;
  bandImage?: string | null; // optional custom photo used as the band background
};

export type WristbandPatch = {
  kind: 'brand' | 'text' | 'logo';
  text: string;
  colorId: string;
  logo: LogoState;
};

export type WristbandActiveEditor = 'band' | 'patch';

export type WristbandState = {
  band: WristbandBand;
  patch: WristbandPatch;
  active: WristbandActiveEditor;
};

export const DEFAULT_WRISTBAND: WristbandState = {
  band:  { preset: 'bold',  colorId: 'black', text: 'GO HAWKS', logo: EMPTY_LOGO, bandImage: null },
  patch: { kind: 'brand',   text: '',         colorId: 'white', logo: EMPTY_LOGO },
  active: 'band',
};

export function isTextPreset(id: WristbandPresetKind): boolean {
  return ['bold', 'sans-soft', 'display', 'verse-ref', 'serif-heavy', 'script',
    'handwritten', 'mono-block', 'verse-full', 'outline', 'name', 'number'].includes(id);
}
export function isLogoPreset(id: WristbandPresetKind): boolean {
  return id.startsWith('logo-');
}

export const TEXT_MAX_LEN: Record<string, number> = {
  bold: 24, 'sans-soft': 24, display: 16, 'verse-ref': 14, 'serif-heavy': 20,
  script: 28, handwritten: 28, 'mono-block': 18, 'verse-full': 110,
  outline: 14, name: 14, number: 2,
};
export const PATCH_TEXT_MAX = 2;

// ─────────────────────────────────────────────────────────────
// Keychain
// ─────────────────────────────────────────────────────────────

export type KeychainShape = 'circular' | 'rectangular' | 'slab';

export type Keychain = {
  shape: KeychainShape;
  city: string;
  year: string;
  series: string;
  logo: LogoState;
  aiMode: boolean;
  aiImage: string | null;
};

export const DEFAULT_KEYCHAIN: Keychain = {
  shape: 'circular',
  city: 'NASHVILLE',
  year: '2026',
  series: '001/250',
  logo: EMPTY_LOGO,
  aiMode: false,
  aiImage: null,
};

// "Shape" picker options that appear in the editor. The first three are real
// shapes; selecting `aiMode = true` is a fourth virtual choice that swaps the
// design experience for a Gemini-rendered mockup.
export const KEYCHAIN_SHAPES: Array<{ id: KeychainShape; name: string; icon: IconName; blurb: string }> = [
  { id: 'circular',     name: 'Circular',     icon: 'circle',  blurb: 'Round acrylic, full-bleed' },
  { id: 'rectangular',  name: 'Rectangular',  icon: 'rect',    blurb: 'Classic card shape' },
  { id: 'slab',         name: 'Card slab',    icon: 'slab',    blurb: 'Mini graded-card look' },
];

// ─────────────────────────────────────────────────────────────
// Jewelry
// ─────────────────────────────────────────────────────────────

export type JewelryType = 'necklace' | 'bracelet';
export type JewelryShape = 'circular' | 'rectangular';
export type JewelryMaterialId = 'gold' | 'silver' | 'rose-gold' | 'black';

export type Jewelry = {
  type: JewelryType;
  shape: JewelryShape;
  material: JewelryMaterialId;
  logo: LogoState;
  aiMode: boolean;
  aiImage: string | null;
};

export const DEFAULT_JEWELRY: Jewelry = {
  type: 'necklace',
  shape: 'circular',
  material: 'gold',
  logo: EMPTY_LOGO,
  aiMode: false,
  aiImage: null,
};

export const JEWELRY_TYPES: Array<{ id: JewelryType; name: string; icon: IconName; blurb: string }> = [
  { id: 'necklace', name: 'Necklace', icon: 'necklace', blurb: '15+3cm chain · adjustable' },
  { id: 'bracelet', name: 'Bracelet', icon: 'bracelet', blurb: '15+3cm chain · adjustable' },
];

export const JEWELRY_SHAPES: Array<{ id: JewelryShape; name: string; icon: IconName }> = [
  { id: 'circular',    name: 'Circle',    icon: 'circle'  },
  { id: 'rectangular', name: 'Rectangle', icon: 'rect'    },
];

export type JewelryMaterial = {
  id: JewelryMaterialId;
  name: string;
  base: string;
  highlight: string;
  dark: string;
  fg: string;
};

export const JEWELRY_MATERIALS: JewelryMaterial[] = [
  { id: 'gold',       name: 'Gold',       base: '#d4af37', highlight: '#f7df9e', dark: '#9a7d24', fg: '#7a5e10' },
  { id: 'silver',     name: 'Silver',     base: '#c6c8cc', highlight: '#f3f4f6', dark: '#8a8c91', fg: '#5a5c61' },
  { id: 'rose-gold',  name: 'Rose gold',  base: '#bf7e85', highlight: '#f5cbb4', dark: '#8b4e54', fg: '#6a373d' },
  { id: 'black',      name: 'Black',      base: '#23232a', highlight: '#5c5c63', dark: '#0a0a0d', fg: '#0a0a0d' },
];

// ─────────────────────────────────────────────────────────────
// Photo charms (Pins + Magnets) — flat items with optional AI render
// ─────────────────────────────────────────────────────────────

export type CharmShape = 'circular' | 'rectangular';

export type PhotoCharm = {
  shape: CharmShape;
  aiMode: boolean;
  aiImage: string | null;
  logoSrc: string | null;
};

export const DEFAULT_PIN: PhotoCharm = { shape: 'circular', aiMode: false, aiImage: null, logoSrc: null };
export const DEFAULT_MAGNET: PhotoCharm = { shape: 'rectangular', aiMode: false, aiImage: null, logoSrc: null };

export const CHARM_SHAPES: Array<{ id: CharmShape; name: string; icon: IconName }> = [
  { id: 'circular',    name: 'Circle',    icon: 'circle'  },
  { id: 'rectangular', name: 'Rectangle', icon: 'rect'    },
];

// ─────────────────────────────────────────────────────────────
// Plushies — Gemini-rendered plush keychain charm
// ─────────────────────────────────────────────────────────────

export type PlushieFabricId = 'minky' | 'cotton' | 'sherpa';

export type Plushie = {
  fabric: PlushieFabricId;
  aiImage: string | null;
  status: 'idle' | 'generating' | 'ready' | 'error';
  error?: string;
};

export const DEFAULT_PLUSHIE: Plushie = {
  fabric: 'minky',
  aiImage: null,
  status: 'idle',
};

export type Figurinez = Plushie;
export const DEFAULT_FIGURINEZ: Figurinez = DEFAULT_PLUSHIE;

export const PLUSHIE_FABRICS: Array<{ id: PlushieFabricId; name: string; blurb: string; swatch: string }> = [
  { id: 'minky',  name: 'Minky',  blurb: 'Ultra-soft · most popular',  swatch: '#f3d6c8' },
  { id: 'cotton', name: 'Cotton', blurb: 'Sturdy · classic feel',      swatch: '#e6e8eb' },
  { id: 'sherpa', name: 'Sherpa', blurb: 'Fuzzy · cuddly extra fluff', swatch: '#f6efe2' },
];

// ─────────────────────────────────────────────────────────────
// Bobbleheads — Gemini stylization + optional Meshy 3D render
// ─────────────────────────────────────────────────────────────

export type BobbleheadStatus = 'idle' | 'generating' | 'ready-2d' | 'generating-3d' | 'ready-3d' | 'error';

export type Bobblehead = {
  aiImage: string | null;       // 2D Gemini-stylized image
  meshyJobId: string | null;    // Meshy job id (when 3D generation kicked off)
  modelUrl: string | null;      // Final GLB URL once Meshy finishes
  status: BobbleheadStatus;
  progress?: number;            // Meshy 0–100
  error?: string;
};

export const DEFAULT_BOBBLEHEAD: Bobblehead = {
  aiImage: null,
  meshyJobId: null,
  modelUrl: null,
  status: 'idle',
};

export type PuzzleStyle = 'photo' | 'card';
export type Puzzle = {
  style: PuzzleStyle;
  templateId: string;
};
export const DEFAULT_PUZZLE: Puzzle = {
  style: 'photo',
  templateId: 'galaxy-holo',
};

export type PendantStatus = 'idle' | 'generating' | 'ready-2d' | 'generating-3d' | 'ready-3d' | 'error';
export type Pendant = {
  finish: 'cameo';
  aiImage: string | null;
  meshyJobId: string | null;
  modelUrl: string | null;
  status: PendantStatus;
  progress?: number;
  error?: string;
};
export const DEFAULT_PENDANT: Pendant = {
  finish: 'cameo',
  aiImage: null,
  meshyJobId: null,
  modelUrl: null,
  status: 'idle',
};

export type CoinFinish = 'gold' | 'silver' | 'bronze';
export type Coin = {
  finish: CoinFinish;
  teamName: string;
  aiImage: string | null;
  status: 'idle' | 'busy' | 'ready' | 'error';
  error?: string;
};
export const DEFAULT_COIN: Coin = {
  finish: 'gold',
  teamName: '',
  aiImage: null,
  status: 'idle',
};

export type ArmyManPose = 'rifle' | 'kneeling' | 'running' | 'radio';
export type ArmyManColor = 'green' | 'tan' | 'gray';
export type ArmyManStatus = 'idle' | 'generating' | 'ready-2d' | 'generating-3d' | 'ready-3d' | 'error';
export type ArmyMan = {
  pose: ArmyManPose;
  color: ArmyManColor;
  aiImage: string | null;
  meshyJobId: string | null;
  modelUrl: string | null;
  status: ArmyManStatus;
  progress?: number;
  error?: string;
};
export const DEFAULT_ARMYMAN: ArmyMan = {
  pose: 'rifle',
  color: 'green',
  aiImage: null,
  meshyJobId: null,
  modelUrl: null,
  status: 'idle',
};

export type RushmoreStatus = 'idle' | 'generating' | 'ready-2d' | 'generating-3d' | 'ready-3d' | 'error';
export type Rushmore = {
  extraPhotos: [string | null, string | null, string | null];
  aiImage: string | null;
  meshyJobId: string | null;
  modelUrl: string | null;
  status: RushmoreStatus;
  progress?: number;
  error?: string;
};
export const DEFAULT_RUSHMORE: Rushmore = {
  extraPhotos: [null, null, null],
  aiImage: null,
  meshyJobId: null,
  modelUrl: null,
  status: 'idle',
};
