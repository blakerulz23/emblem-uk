import { CardData } from './types';
import {
  GHB_W, GHB_H, GHB_LAYOUT,
  GHB_BACK_SPORT_STATS, GHB_SPORT_PROFILE,
} from './galaxyHoloBackCoordinates';
import { GHB_THEME } from './galaxyHoloBackTheme';

// ── Layer manifest ────────────────────────────────────────
// 01_back_background_texture.png is the consolidated reference asset:
// it contains texture + frame + star dividers + stats grid + profile icons + NFC footer.
// 02_back_frame, 04_back_divider_lines, 07_back_footer_nfc are therefore NOT loaded —
// they are baked into the background to avoid double-rendering.
// Only the YC logo (03) remains as a separate overlay.
export const GHB_LAYERS: { key: string; src: string }[] = [
  { key: 'ghbBase', src: '/templates/galaxy-holo/back/01_back_background_texture.png' },
  { key: 'ghbLogo', src: '/templates/galaxy-holo/back/03_back_brand_logo.png'         },
];

// ── Helpers ───────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(' ');
  let line = '';
  let row = 0;

  for (let i = 0; i < words.length; i++) {
    const test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (row >= maxLines - 1) {
        ctx.fillText(line + '…', cx, y + row * lineHeight);
        return;
      }
      ctx.fillText(line, cx, y + row * lineHeight);
      line = words[i];
      row++;
    } else {
      line = test;
    }
  }
  if (line && row < maxLines) ctx.fillText(line, cx, y + row * lineHeight);
}

// ── Main renderer ─────────────────────────────────────────

export function drawGalaxyHoloBack(
  ctx: CanvasRenderingContext2D,
  card: CardData,
  w: number,
  h: number,
  imgs: Partial<Record<string, HTMLImageElement>>,
): void {
  const sx = w / GHB_W;
  const sy = h / GHB_H;
  const L  = GHB_LAYOUT;

  // ── Layer 01: Pearl holographic background ──
  if (imgs.ghbBase) {
    ctx.drawImage(imgs.ghbBase, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  }

  // ── Layer 03: YC brand logo (separate overlay — not in background PNG) ──
  if (imgs.ghbLogo) ctx.drawImage(imgs.ghbLogo, 0, 0, w, h);

  // ── Layer 08: Dynamic text ────────────────────────────────

  // 8a. "YOUTHCARDS" brand label — below logo
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = GHB_THEME.brand.color;
  ctx.font = `700 ${Math.round(GHB_THEME.brand.size * sx)}px "Oswald", sans-serif`;
  ctx.letterSpacing = `${(GHB_THEME.brand.letterSpacing * sx).toFixed(1)}px`;
  ctx.fillText('YOUTHCARDS', Math.round(L.brandLabel.cx * sx), Math.round(L.brandLabel.cy * sy));
  ctx.letterSpacing = '0px';
  ctx.restore();

  // 8b. Player name — large italic bold, auto-shrink
  ctx.save();
  const nameText = (card.playerName || 'PLAYER NAME').toUpperCase();
  let namePx = GHB_THEME.playerName.size;
  const maxNameW = GHB_THEME.playerName.maxWidth * sx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${(GHB_THEME.playerName.letterSpacing * sx).toFixed(1)}px`;
  ctx.font = `800 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  while (ctx.measureText(nameText).width > maxNameW && namePx > 32) {
    namePx -= 2;
    ctx.font = `800 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  }
  ctx.fillStyle = GHB_THEME.playerName.color;
  ctx.fillText(nameText, Math.round(L.playerName.cx * sx), Math.round(L.playerName.cy * sy));
  ctx.letterSpacing = '0px';
  ctx.restore();

  // 8c. Position  |  #Number
  ctx.save();
  const posLine = [
    (card.position || 'POSITION').toUpperCase(),
    `#${card.jerseyNumber || '00'}`,
  ].join('  |  ');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${(GHB_THEME.positionNumber.letterSpacing * sx).toFixed(1)}px`;
  ctx.font = `600 ${Math.round(GHB_THEME.positionNumber.size * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = GHB_THEME.positionNumber.color;
  ctx.fillText(posLine, Math.round(L.posNumber.cx * sx), Math.round(L.posNumber.cy * sy));
  ctx.letterSpacing = '0px';
  ctx.restore();

  // 8d. "PLAYER STORY" section header
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${(GHB_THEME.sectionLabel.letterSpacing * sx).toFixed(1)}px`;
  ctx.font = `700 ${Math.round(GHB_THEME.sectionLabel.size * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = GHB_THEME.sectionLabel.color;
  ctx.fillText('PLAYER STORY', Math.round(L.storyHeader.cx * sx), Math.round(L.storyHeader.cy * sy));
  ctx.letterSpacing = '0px';
  ctx.restore();

  // 8e. Bio / story paragraph — word-wrapped, centered
  if (card.backText) {
    ctx.save();
    ctx.font = `400 ${Math.round(GHB_THEME.storyText.size * sx)}px "Saira", "Arial", sans-serif`;
    ctx.fillStyle = GHB_THEME.storyText.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    wrapText(
      ctx,
      card.backText,
      Math.round(L.storyText.cx * sx),
      Math.round(L.storyText.y  * sy),
      L.storyText.w * sx,
      L.storyText.lineHeight * sy,
      L.storyText.maxLines,
    );
    ctx.restore();
  }

  // 8f. Season stats — 3 columns
  if (card.sport) {
    const sportStats = GHB_BACK_SPORT_STATS[card.sport] ?? GHB_BACK_SPORT_STATS.baseball;
    const cols = L.statSection.colCenters;
    const maxValW = L.statSection.colWidth * sx;

    sportStats.slice(0, 3).forEach((stat, i) => {
      const cx      = Math.round(cols[i] * sx);
      const labelCY = Math.round(L.statSection.labelCY * sy);
      const valueCY = Math.round(L.statSection.valueCY * sy);
      const val     = card.showStats ? ((card.stats || {})[stat.key] || '—') : '—';

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Label
      ctx.font = `700 ${Math.round(GHB_THEME.statLabel.size * sx)}px "Oswald", sans-serif`;
      ctx.fillStyle = GHB_THEME.statLabel.color;
      ctx.fillText(stat.label, cx, labelCY);

      // Value — auto-shrink
      let valPx = GHB_THEME.statValue.size;
      ctx.font = `900 ${Math.round(valPx * sx)}px "Oswald", "Arial Black", sans-serif`;
      while (ctx.measureText(val).width > maxValW && valPx > 18) {
        valPx -= 2;
        ctx.font = `900 ${Math.round(valPx * sx)}px "Oswald", "Arial Black", sans-serif`;
      }
      ctx.fillStyle = GHB_THEME.statValue.color;
      ctx.fillText(val, cx, valueCY);
      ctx.restore();
    });
  }

  // 8g. Profile rows — icon column from PNG, label + value dynamic
  const sport = card.sport || 'baseball';
  const profileDefs = GHB_SPORT_PROFILE[sport] ?? GHB_SPORT_PROFILE.baseball;
  const ps = L.profileSection;
  const maxValW = (ps.valueX - ps.labelX - 20) * sx;

  profileDefs.forEach((def, i) => {
    // Vertical center of this row — last row gets a small upward nudge
    const rowNudge = i === profileDefs.length - 1 ? -4 * sy : 0;
    const cy       = Math.round((ps.startY + (i + 0.5) * ps.rowHeight) * sy + rowNudge);
    const valueX = Math.round(ps.valueX * sx);

    // Pull value from card
    let value: string;
    if (def.cardField === 'stats' && def.statsKey) {
      value = (card.stats || {})[def.statsKey] || '—';
    } else {
      value = ((card as unknown as Record<string, unknown>)[def.cardField] as string) || '—';
    }

    ctx.save();
    ctx.textBaseline = 'middle';

    // Labels are baked into 01_back_background_texture.png — do not redraw here.

    // Profile value — right-aligned, auto-shrink
    let pvPx = GHB_THEME.profileValue.size;
    ctx.font = `700 ${Math.round(pvPx * sx)}px "Oswald", sans-serif`;
    ctx.textAlign = 'right';
    while (ctx.measureText(value.toUpperCase()).width > maxValW && pvPx > 10) {
      pvPx -= 1;
      ctx.font = `700 ${Math.round(pvPx * sx)}px "Oswald", sans-serif`;
    }
    ctx.fillStyle = GHB_THEME.profileValue.color;
    ctx.fillText(value.toUpperCase(), valueX, cy);
    ctx.restore();
  });

  // NFC footer is baked into 01_back_background_texture.png — no separate draw needed.
}
