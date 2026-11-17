/**
 * Ranks card designs against the colours of the player's kit, entirely on
 * the device. Ported unchanged from Emblem Canada (emblem-ca
 * src/lib/jersey-colour-match.ts, with its tests): the UK direct builder's
 * "Pick their card" step uses it to put the design that suits the kit first,
 * without sending the photo anywhere; it reads the colours from the
 * background-removed cut-out's own pixels.
 *
 * Pure apart from sampleJerseyColours, which needs a browser canvas.
 */

export type Rgb = { r: number; g: number; b: number };
export type JerseyColour = { hex: string; share: number };

/** Below this chroma a colour is white, black or grey: it says nothing about the team. */
const NEUTRAL_CHROMA = 18;
/** Colours closer than this (CIE76 ΔE) are one kit colour, not two. */
const MERGE_DISTANCE = 22;

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** sRGB (0-255) to CIE Lab, D65. */
export function rgbToLab({ r, g, b }: Rgb): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function chroma(rgb: Rgb): number {
  const [, a, b] = rgbToLab(rgb);
  return Math.hypot(a, b);
}

/**
 * Skin, from pale to deep: a warm hue (Lab hue 25-80 degrees) at moderate
 * chroma. The torso band always catches some neck and arms, and without this
 * a white kit "matched" whichever design was closest to skin. A true orange or
 * gold kit is far more saturated (chroma over 56) and still counts.
 */
export function looksLikeSkin(rgb: Rgb): boolean {
  const [l, a, b] = rgbToLab(rgb);
  const c = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  // UK change from the Canada original (50): sunlit skin on outdoor football
  // photos measured chroma 51.7 and showed up as a peach "kit" swatch. True
  // orange and gold kits sit well above 56.
  return l > 20 && l < 90 && c >= 8 && c <= 56 && hue >= 25 && hue <= 80;
}

/**
 * The jersey's main colours from RGBA pixel data, most common first. Only the
 * torso band of the frame is read (the kit, not the face, hair or stick), and
 * transparent pixels (the removed background) are skipped. White, black and
 * grey are dropped: almost every kit has some, so they never pick a design.
 */
export function dominantColours(
  data: ArrayLike<number>,
  width: number,
  height: number,
  limit = 3,
): JerseyColour[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let counted = 0;
  const top = Math.floor(height * 0.42);
  const bottom = Math.floor(height * 0.88);
  const left = Math.floor(width * 0.18);
  const right = Math.ceil(width * 0.82);
  const step = Math.max(1, Math.floor(Math.sqrt(((bottom - top) * (right - left)) / 6000)));
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      counted += 1;
      if (chroma(rgb) < NEUTRAL_CHROMA || looksLikeSkin(rgb)) continue;
      // 5 bits a channel: coarse enough that one fabric shade lands in one bucket.
      const key = ((rgb.r >> 3) << 10) | ((rgb.g >> 3) << 5) | (rgb.b >> 3);
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bucket.r += rgb.r; bucket.g += rgb.g; bucket.b += rgb.b; bucket.n += 1;
      buckets.set(key, bucket);
    }
  }
  if (!counted) return [];
  const merged: { rgb: Rgb; n: number }[] = [];
  for (const bucket of Array.from(buckets.values()).sort((a, b) => b.n - a.n)) {
    const rgb = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n };
    const same = merged.find((m) => deltaE(m.rgb, rgb) < MERGE_DISTANCE);
    if (same) same.n += bucket.n;
    else merged.push({ rgb, n: bucket.n });
  }
  return merged
    .sort((a, b) => b.n - a.n)
    // A colour on under 4% of the kit is a logo, a stripe or noise.
    .filter((m) => m.n / counted >= 0.04)
    .slice(0, limit)
    .map((m) => ({ hex: rgbToHex(m.rgb), share: m.n / counted }));
}

/**
 * How far a design's accent is from a kit colour, for ranking. Lightness
 * counts for a third: design accents are bright glows and kits are fabric in
 * daylight, so a navy kit and an ice-blue design are the same team colour
 * at different brightness, and should match.
 */
export function kitDistance(accent: Rgb, kit: Rgb): number {
  const [l1, a1, b1] = rgbToLab(accent);
  const [l2, a2, b2] = rgbToLab(kit);
  return Math.hypot((l1 - l2) * 0.35, a1 - a2, b1 - b2);
}

export type ColourRanked<T> = { item: T; score: number };

/**
 * Designs ordered by how close their accent sits to the kit, best first. The
 * score is the share-weighted kitDistance to the jersey colours (lower is
 * better). With no usable colours (a white or black kit, or no cut-out) the
 * list keeps its own order, so the default design stays first.
 */
export function rankByJersey<T>(items: readonly T[], accentOf: (item: T) => string, colours: readonly JerseyColour[]): ColourRanked<T>[] {
  if (!colours.length) return items.map((item) => ({ item, score: Number.POSITIVE_INFINITY }));
  const total = colours.reduce((sum, c) => sum + c.share, 0);
  return items
    .map((item, index) => {
      const accent = hexToRgb(accentOf(item));
      const score = colours.reduce((sum, c) => sum + kitDistance(accent, hexToRgb(c.hex)) * (c.share / total), 0);
      return { item, score, index };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item, score }) => ({ item, score }));
}

/** A ranked design close enough to the kit to call a match out loud. */
export const STRONG_MATCH_DELTA_E = 40;

/** Reads the jersey colours from an image URL (the cut-out) in the browser. */
export async function sampleJerseyColours(url: string): Promise<JerseyColour[]> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  // onload, not decode(): decode() can wait indefinitely in a background tab.
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = url;
  });
  const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, width, height);
  return dominantColours(context.getImageData(0, 0, width, height).data, width, height);
}
