'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { CardData, SPORT_INFO, SPORT_STATS } from '@/lib/types';
import { GHB_LAYERS, drawGalaxyHoloBack } from '@/lib/galaxyHoloBackLayers';
import { CHROME_LEGACY_BACK_CANVAS } from '@/lib/chromeLegacyBackLayers';

interface CardCanvasProps {
  card: CardData;
  side: 'front' | 'back';
  width?: number;
  height?: number;
}

const CARD_W = 500;
const CARD_H = 700;

// Galaxy Holo asset canvas size
const GH_W = 1054;
const GH_H = 1492;

// ─── Utility ───────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 220, g: 38, b: 38 };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawBackPhoto(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  backPhotoImg: HTMLImageElement | null, frameY: number, frameSize: number,
  borderColor: string, shadowColor?: string
) {
  if (!backPhotoImg) return;
  const frameX = w / 2 - frameSize / 2;
  ctx.save();
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 12;
  }
  drawRoundedRect(ctx, frameX - 3, frameY - 3, frameSize + 6, frameSize + 6, 8);
  ctx.fillStyle = borderColor;
  ctx.fill();
  if (shadowColor) ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 6);
  ctx.clip();

  const scale = card.backPhotoScale || 1;
  const imgW = backPhotoImg.width;
  const imgH = backPhotoImg.height;
  const aspect = imgW / imgH;
  let drawW: number, drawH: number;
  if (aspect > 1) {
    drawH = frameSize * scale;
    drawW = drawH * aspect;
  } else {
    drawW = frameSize * scale;
    drawH = drawW / aspect;
  }
  const ox = (card.backPhotoOffsetX || 0) / 100 * frameSize;
  const oy = (card.backPhotoOffsetY || 0) / 100 * frameSize;
  const dx = frameX + (frameSize - drawW) / 2 + ox;
  const dy = frameY + (frameSize - drawH) / 2 + oy;
  ctx.drawImage(backPhotoImg, dx, dy, drawW, drawH);
  ctx.restore();
}

function drawNfcBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, style: 'green' | 'white' | 'neon' = 'green') {
  ctx.save();
  if (style === 'green') {
    // Green pill badge like the reference
    const pillW = size * 3.2;
    const pillH = size * 1.6;
    drawRoundedRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = '#16A34A';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.85}px "Oswald", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NFC', x, y);
  } else if (style === 'neon') {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(0,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(x - size * 0.15, y + size * 0.1, size * 0.2 * i, -Math.PI * 0.8, -Math.PI * 0.15);
      ctx.stroke();
    }
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(x - size * 0.15, y + size * 0.1, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${size * 0.35}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NFC', x, y + size * 0.65);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(x - size * 0.15, y + size * 0.1, size * 0.2 * i, -Math.PI * 0.8, -Math.PI * 0.15);
      ctx.stroke();
    }
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x - size * 0.15, y + size * 0.1, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${size * 0.35}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NFC', x, y + size * 0.65);
  }
  ctx.restore();
}

// ─── Sport Decorations ─────────────────────────────────

function drawSportDecorHolo(ctx: CanvasRenderingContext2D, sport: string, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  if (sport === 'baseball') {
    // Baseball stitching arcs along right edge
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const y = h * 0.08 + i * (h * 0.11);
      ctx.beginPath();
      ctx.moveTo(w * 0.88, y);
      ctx.quadraticCurveTo(w * 0.96, y + h * 0.055, w * 0.88, y + h * 0.11);
      ctx.stroke();
      // small tick marks
      for (let j = 0; j < 4; j++) {
        const ty = y + j * (h * 0.11 / 4) + h * 0.015;
        ctx.beginPath();
        ctx.moveTo(w * 0.89, ty);
        ctx.lineTo(w * 0.92, ty + h * 0.005);
        ctx.stroke();
      }
    }
  } else if (sport === 'basketball') {
    // Court lines and circle
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, w * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.03);
    ctx.lineTo(w * 0.5, h * 0.97);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, w * 0.15, 0, Math.PI * 2);
    ctx.stroke();
  } else if (sport === 'soccer') {
    // Hexagonal ball pattern
    const cx = w * 0.85;
    const cy = h * 0.25;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 + ring * (Math.PI / 6);
        const r = w * (0.08 + ring * 0.12);
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const va = (v * Math.PI * 2) / 6;
          const vx = px + w * 0.04 * Math.cos(va);
          const vy = py + w * 0.04 * Math.sin(va);
          if (v === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else if (sport === 'football') {
    // Yard lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 9; i++) {
      const y = h * (0.05 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(w * 0.02, y);
      ctx.lineTo(w * 0.06, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.94, y);
      ctx.lineTo(w * 0.98, y);
      ctx.stroke();
    }
    // Football laces
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    const fx = w * 0.88, fy = h * 0.7;
    ctx.beginPath();
    ctx.ellipse(fx, fy, w * 0.08, w * 0.13, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSportDecorChrome(ctx: CanvasRenderingContext2D, sport: string, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;

  if (sport === 'baseball') {
    // Bat silhouette along left edge
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.3);
    ctx.lineTo(w * 0.06, h * 0.8);
    ctx.lineTo(w * 0.08, h * 0.82);
    ctx.lineTo(w * 0.08, h * 0.85);
    ctx.lineTo(w * 0.04, h * 0.85);
    ctx.lineTo(w * 0.04, h * 0.82);
    ctx.lineTo(w * 0.06, h * 0.8);
    ctx.stroke();
  } else if (sport === 'basketball') {
    // Flame-like curves
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const x = w * 0.3 + i * w * 0.2;
      ctx.moveTo(x, h * 0.95);
      ctx.quadraticCurveTo(x - w * 0.03, h * 0.85, x + w * 0.01, h * 0.78);
      ctx.stroke();
    }
  } else if (sport === 'soccer') {
    // Grass texture lines at bottom
    for (let i = 0; i < 20; i++) {
      const x = w * 0.05 + i * w * 0.045;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.95);
      ctx.lineTo(x + w * 0.01, h * 0.92);
      ctx.stroke();
    }
  } else if (sport === 'football') {
    // Gridiron hash marks
    for (let i = 0; i < 6; i++) {
      const x = w * 0.15 + i * w * 0.14;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.93);
      ctx.lineTo(x, h * 0.97);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.04, h * 0.93);
      ctx.lineTo(x + w * 0.04, h * 0.97);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ─── Photo Rendering ───────────────────────────────────

function drawPlayerPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number, y: number, w: number, h: number,
  offsetX: number, offsetY: number, scale: number,
  rounded = 0
) {
  ctx.save();
  if (rounded > 0) {
    drawRoundedRect(ctx, x, y, w, h, rounded);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();

  if (img) {
    const imgAspect = img.width / img.height;
    const areaAspect = w / h;
    let drawW: number, drawH: number;
    if (imgAspect > areaAspect) {
      drawH = h * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = w * scale;
      drawH = drawW / imgAspect;
    }
    const drawX = x + (w - drawW) / 2 + offsetX;
    const drawY = y + (h - drawH) / 2 + offsetY;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${w * 0.12}px "Oswald", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAYER PHOTO', x + w / 2, y + h / 2);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE 1: HOLO CLASSIC
// ═══════════════════════════════════════════════════════

function drawHoloBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Silver/chrome metallic base
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#e8e8e8');
  base.addColorStop(0.2, '#d4d4d4');
  base.addColorStop(0.4, '#f0f0f0');
  base.addColorStop(0.6, '#c8c8c8');
  base.addColorStop(0.8, '#e0e0e0');
  base.addColorStop(1, '#d0d0d0');
  ctx.fillStyle = base;
  drawRoundedRect(ctx, 0, 0, w, h, 12);
  ctx.fill();

  // Holographic rainbow radial gradients - layered
  const holoColors = [
    { cx: 0.2, cy: 0.15, r: 0.6, color: 'rgba(255,0,128,0.18)' },   // magenta
    { cx: 0.8, cy: 0.1, r: 0.5, color: 'rgba(0,255,200,0.15)' },    // cyan
    { cx: 0.5, cy: 0.4, r: 0.7, color: 'rgba(120,255,0,0.12)' },    // lime
    { cx: 0.15, cy: 0.7, r: 0.5, color: 'rgba(255,215,0,0.16)' },   // gold
    { cx: 0.85, cy: 0.6, r: 0.55, color: 'rgba(255,100,0,0.14)' },  // orange
    { cx: 0.5, cy: 0.85, r: 0.6, color: 'rgba(180,130,255,0.15)' }, // lavender
    { cx: 0.3, cy: 0.5, r: 0.4, color: 'rgba(0,200,255,0.13)' },   // sky
    { cx: 0.7, cy: 0.3, r: 0.45, color: 'rgba(255,255,0,0.10)' },  // yellow
  ];

  for (const h2 of holoColors) {
    const grad = ctx.createRadialGradient(
      w * h2.cx, h * h2.cy, 0,
      w * h2.cx, h * h2.cy, w * h2.r
    );
    grad.addColorStop(0, h2.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Diagonal rainbow sheen sweep
  ctx.save();
  const sweep = ctx.createLinearGradient(0, 0, w * 1.2, h * 0.8);
  sweep.addColorStop(0, 'rgba(255,0,100,0.08)');
  sweep.addColorStop(0.15, 'rgba(255,165,0,0.1)');
  sweep.addColorStop(0.3, 'rgba(255,255,0,0.08)');
  sweep.addColorStop(0.45, 'rgba(0,255,100,0.1)');
  sweep.addColorStop(0.6, 'rgba(0,200,255,0.1)');
  sweep.addColorStop(0.75, 'rgba(100,0,255,0.08)');
  sweep.addColorStop(0.9, 'rgba(255,0,200,0.1)');
  sweep.addColorStop(1, 'rgba(255,100,0,0.08)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Subtle shimmer lines
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = -h; i < w + h; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h * 0.4, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.restore();
}

function drawHoloFront(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  playerImg: HTMLImageElement | null, logoImg: HTMLImageElement | null
) {
  const sport = card.sport || 'baseball';
  const sportInfo = SPORT_INFO[sport];

  // Holographic background
  drawHoloBackground(ctx, w, h);

  // Sport decorations
  drawSportDecorHolo(ctx, sport, w, h);

  // Sport header text top-left
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `bold ${w * 0.055}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '3px';
  ctx.fillText(sportInfo.label.toUpperCase(), w * 0.05, w * 0.09);
  ctx.restore();

  // Black rectangular photo frame
  const photoX = w * 0.08;
  const photoY = h * 0.1;
  const photoW = w * 0.84;
  const photoH = h * 0.56;

  // Photo frame shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#000000';
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);
  ctx.restore();

  // Black border
  ctx.fillStyle = '#000000';
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);

  // Player photo
  drawPlayerPhoto(ctx, playerImg, photoX, photoY, photoW, photoH, card.photoOffsetX, card.photoOffsetY, card.photoScale);

  // NFC green pill badge overlapping bottom-right of photo frame
  const nfcX = photoX + photoW - w * 0.02;
  const nfcY = photoY + photoH;
  drawNfcBadge(ctx, nfcX, nfcY, w * 0.028, 'green');

  // Team name bottom-left — large bold serif
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${w * 0.09}px "Oswald", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const teamText = (card.teamName || 'TEAM').toUpperCase();
  ctx.fillText(teamText, w * 0.06, h * 0.72);

  // Year below team name in italic
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `italic ${w * 0.04}px Georgia, serif`;
  ctx.fillText(new Date().getFullYear().toString(), w * 0.06, h * 0.72 + w * 0.1);
  ctx.restore();

  // Player name bottom-right — deep red/crimson, lowercase bold
  ctx.save();
  ctx.fillStyle = '#8B0000';
  ctx.font = `bold ${w * 0.065}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const nameText = (card.playerName || 'player name').toLowerCase();
  ctx.fillText(nameText, w * 0.94, h * 0.72);

  // Position below name in same red
  if (card.position) {
    ctx.fillStyle = '#8B0000';
    ctx.font = `${w * 0.035}px "Oswald", Arial, sans-serif`;
    ctx.fillText(card.position, w * 0.94, h * 0.72 + w * 0.07);
  }
  ctx.restore();

  // Jersey number — subtle top-right of card
  if (card.jerseyNumber) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `bold ${w * 0.14}px "Oswald", "Arial Black", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`#${card.jerseyNumber}`, w * 0.95, h * 0.96);
    ctx.restore();
  }

  // Team logo (small, bottom center area)
  if (logoImg) {
    const logoSize = w * 0.1;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(logoImg, w * 0.44, h * 0.87, logoSize, logoSize);
    ctx.globalAlpha = 1;
  }

  // YouthCards watermark
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.font = `${w * 0.025}px "Oswald", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUTHCARDS', w / 2, h - 8);
}

function drawStatsSection(
  ctx: CanvasRenderingContext2D,
  card: CardData,
  w: number,
  startY: number,
  style: 'holo' | 'futuristic' | 'chrome',
  accent?: string
): number {
  if (!card.showStats || !card.sport) return startY;
  const statsConfig = SPORT_STATS[card.sport];
  if (!statsConfig) return startY;

  const displayStats = statsConfig.slice(0, 6);
  const rgb = accent ? hexToRgb(accent) : { r: 0, g: 0, b: 0 };

  let y = startY;

  // Section title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `bold ${w * 0.035}px "Oswald", "Arial Black", sans-serif`;
  if (style === 'holo') {
    ctx.fillStyle = '#000000';
  } else if (style === 'futuristic') {
    ctx.shadowColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    ctx.shadowBlur = 8;
    ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  } else {
    const titleGrad = ctx.createLinearGradient(0, y - w * 0.04, 0, y);
    titleGrad.addColorStop(0, '#ffffff');
    titleGrad.addColorStop(0.5, '#cccccc');
    titleGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = titleGrad;
  }
  ctx.fillText('SEASON STATS', w / 2, y);
  ctx.restore();

  y += w * 0.04;

  // Divider line under title
  ctx.save();
  if (style === 'holo') {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
  } else if (style === 'futuristic') {
    ctx.shadowColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.4)`;
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.15, y);
  ctx.lineTo(w * 0.85, y);
  ctx.stroke();
  ctx.restore();

  y += w * 0.03;

  // 3-column grid
  const colW = w * 0.26;
  const rowH = w * 0.11;
  const gridStartX = w * 0.11;

  for (let i = 0; i < displayStats.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = gridStartX + col * colW + colW / 2;
    const cy = y + row * rowH;

    const stat = displayStats[i];
    const value = (card.stats || {})[stat.key] || '—';

    // Value (large, bold)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold ${w * 0.055}px "Oswald", "Arial Black", sans-serif`;
    if (style === 'holo') {
      ctx.fillStyle = '#000000';
    } else if (style === 'futuristic') {
      ctx.shadowColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
    } else {
      const valGrad = ctx.createLinearGradient(0, cy - w * 0.03, 0, cy + w * 0.01);
      valGrad.addColorStop(0, '#ffffff');
      valGrad.addColorStop(0.5, '#dddddd');
      valGrad.addColorStop(1, '#ffffff');
      ctx.fillStyle = valGrad;
    }
    ctx.fillText(value, cx, cy);
    ctx.restore();

    // Label (smaller, below)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `${w * 0.028}px "Oswald", Arial, sans-serif`;
    if (style === 'holo') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
    } else if (style === 'futuristic') {
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.7)`;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
    }
    ctx.fillText(stat.label, cx, cy + w * 0.035);
    ctx.restore();
  }

  const totalRows = Math.ceil(displayStats.length / 3);
  return y + totalRows * rowH + w * 0.02;
}

function drawHoloBack(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  logoImg: HTMLImageElement | null, backPhotoImg: HTMLImageElement | null
) {
  drawHoloBackground(ctx, w, h);

  const hasBackPhoto = !!backPhotoImg;

  // Header bar
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  drawRoundedRect(ctx, 0, 0, w, h * 0.12, 12);
  ctx.fill();
  ctx.fillRect(0, 12, w, h * 0.12 - 12);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${w * 0.07}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((card.playerName || 'PLAYER NAME').toUpperCase(), w / 2, h * 0.075);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `${w * 0.035}px "Oswald", Arial, sans-serif`;
  const subLine = [card.teamName, card.position, card.jerseyNumber ? `#${card.jerseyNumber}` : '']
    .filter(Boolean).join('  |  ');
  ctx.fillText(subLine || 'Team | Position', w / 2, h * 0.105);

  // Back photo
  let contentY = h * 0.14;
  if (hasBackPhoto) {
    const frameSize = w * 0.4;
    drawBackPhoto(ctx, card, w, h, backPhotoImg, contentY + 8, frameSize, 'rgba(0,0,0,0.6)');
    contentY += frameSize + 20;
  }

  // Team logo watermark
  if (logoImg) {
    const logoSize = w * (hasBackPhoto ? 0.25 : 0.45);
    const logoCenterY = hasBackPhoto ? contentY + logoSize * 0.3 : h * 0.38;
    ctx.globalAlpha = hasBackPhoto ? 0.12 : 0.25;
    ctx.drawImage(logoImg, w / 2 - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
    ctx.globalAlpha = 1;
  }

  // Info section
  const infoY = hasBackPhoto ? contentY + 10 : h * 0.64;

  ctx.fillStyle = '#000000';
  ctx.font = `bold ${w * 0.055}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((card.teamName || 'TEAM NAME').toUpperCase(), w / 2, infoY);

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, infoY + 10);
  ctx.lineTo(w * 0.8, infoY + 10);
  ctx.stroke();

  ctx.fillStyle = '#8B0000';
  ctx.font = `bold ${w * 0.045}px "Oswald", "Arial Black", sans-serif`;
  const posNum = [card.position, card.jerseyNumber ? `#${card.jerseyNumber}` : ''].filter(Boolean).join('  •  ');
  ctx.fillText(posNum || 'Position • #00', w / 2, infoY + h * 0.05);

  // Stats section
  let nextY = infoY + h * 0.08;
  nextY = drawStatsSection(ctx, card, w, nextY, 'holo');

  // Back text
  if (card.backText) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = `italic ${w * 0.035}px "Oswald", Arial, sans-serif`;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, card.backText, w * 0.8);
    const lineHeight = w * 0.045;
    lines.slice(0, 5).forEach((line, i) => {
      ctx.fillText(line, w / 2, nextY + i * lineHeight);
    });
  }

  // NFC badge
  drawNfcBadge(ctx, w / 2, h * 0.88, w * 0.03, 'green');

  // Footer
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = `${w * 0.025}px "Oswald", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUTHCARDS.COM  •  NFC-ENABLED  •  HOLO EDITION', w / 2, h - 10);
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE 2: FUTURISTIC
// ═══════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawFuturisticBackground(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  const rgb = hexToRgb(accent);

  // Deep dark base
  const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
  base.addColorStop(0, '#050510');
  base.addColorStop(0.5, '#0a0a1a');
  base.addColorStop(1, '#050508');
  ctx.fillStyle = base;
  drawRoundedRect(ctx, 0, 0, w, h, 12);
  ctx.fill();

  // Subtle grid pattern
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // Diagonal geometric cut — accent colored triangle
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.6);
  ctx.lineTo(w * 0.4, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Top-right diagonal accent
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#00ffff';
  ctx.beginPath();
  ctx.moveTo(w * 0.7, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Holographic stripe accent band
  ctx.save();
  const stripeY = h * 0.68;
  const stripeH = h * 0.005;
  const stripe = ctx.createLinearGradient(0, stripeY, w, stripeY);
  stripe.addColorStop(0, 'rgba(255,0,128,0.6)');
  stripe.addColorStop(0.25, 'rgba(255,255,0,0.6)');
  stripe.addColorStop(0.5, 'rgba(0,255,128,0.6)');
  stripe.addColorStop(0.75, 'rgba(0,128,255,0.6)');
  stripe.addColorStop(1, 'rgba(200,0,255,0.6)');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, stripeY, w, stripeH);
  // Glow around stripe
  ctx.shadowColor = 'rgba(0,255,255,0.5)';
  ctx.shadowBlur = 10;
  ctx.fillRect(0, stripeY, w, stripeH);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Asset-space dimensions (all coordinates below are in this space)
const FUT_W = 1060;
const FUT_H = 1484;

function drawFuturisticFront(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  playerImg: HTMLImageElement | null, logoImg: HTMLImageElement | null,
  assets: Partial<Record<string, HTMLImageElement>>
) {
  // All canonical coordinates are in FUT_W × FUT_H (1060 × 1484) space.
  // sx / sy scale every coordinate to the actual canvas size.
  const sx = w / FUT_W;
  const sy = h / FUT_H;

  // Full-canvas detection: a PNG exported at 1060×1484 has the same aspect ratio as the card.
  const isCardSized = (img: HTMLImageElement) =>
    img.width > 400 && Math.abs(img.width / img.height - FUT_W / FUT_H) < 0.06;

  // ── 1. Background ────────────────────────────────────────
  if (assets.background) {
    ctx.drawImage(assets.background, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#06010a';
    ctx.fillRect(0, 0, w, h);
  }

  // ── 2. Player photo ──────────────────────────────────────
  // Full-canvas player PNGs (same 1060×1484 canvas) are drawn at natural
  // position so the player cutout lines up with the frame assets.
  // User-uploaded cropped cutouts use the photo box spec instead.
  if (playerImg) {
    if (isCardSized(playerImg)) {
      // Scale from the image centre so photoScale / offset work intuitively
      const s = card.photoScale;
      const dw = w * s;
      const dh = h * s;
      const ox = (w - dw) / 2 + (card.photoOffsetX / 100) * w * 0.4;
      const oy = (h - dh) / 2 + (card.photoOffsetY / 100) * h * 0.3;
      ctx.drawImage(playerImg, ox, oy, dw, dh);
    } else {
      // Cropped cutout: contain within photo box, bottom-centre anchor
      // Photo box: x=55 y=190 w=950 h=820 (canonical)
      const boxX = 55 * sx, boxY = 190 * sy;
      const boxW = 950 * sx, boxH = 820 * sy;
      const fit = Math.min(boxW / playerImg.width, boxH / playerImg.height) * card.photoScale;
      const dw = playerImg.width * fit;
      const dh = playerImg.height * fit;
      const ox = boxX + (boxW - dw) / 2 + (card.photoOffsetX / 100) * boxW;
      const oy = boxY + boxH - dh + (card.photoOffsetY / 100) * boxH;
      ctx.drawImage(playerImg, ox, oy, dw, dh);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(55 * sx, 190 * sy, 950 * sx, 820 * sy);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = `bold ${Math.round(60 * sx)}px "Oswald", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAYER PHOTO', w / 2, (190 + 410) * sy);
    ctx.textBaseline = 'alphabetic';
  }

  // ── 3. Frame ─────────────────────────────────────────────
  if (assets.frame) ctx.drawImage(assets.frame, 0, 0, w, h);

  // ── 4. Team logo ─────────────────────────────────────────
  // Full-canvas logo PNGs have the badge baked at canonical position — draw at (0,0,w,h).
  // Cropped uploads are drawn into the logo zone: x=110 y=135 w=230 h=230 (canonical).
  if (logoImg) {
    if (isCardSized(logoImg)) {
      ctx.drawImage(logoImg, 0, 0, w, h);
    } else {
      ctx.drawImage(logoImg, 110 * sx, 135 * sy, 230 * sx, 230 * sy);
    }
  } else {
    const sport = card.sport || 'basketball';
    ctx.font = `${Math.round(110 * sx)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SPORT_INFO[sport].icon, 225 * sx, 250 * sy);
    ctx.textBaseline = 'alphabetic';
  }

  // ── 5. Badge ─────────────────────────────────────────────
  if (assets.badge) ctx.drawImage(assets.badge, 0, 0, w, h);

  // ── 6. Jersey number ─────────────────────────────────────────────────
  // Badge has a bright top rim at y≈127 and bottom rim at y≈257.
  // Optical centre between the two rims: (127+257)/2 = 192.
  if (card.jerseyNumber) {
    ctx.save();
    ctx.font = `900 ${Math.round(92 * sx)}px "Oswald", "Arial Black", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8 * sx;
    ctx.fillText(card.jerseyNumber, 854 * sx, 192 * sy);
    ctx.restore();
  }

  // ── 7. Top banner ────────────────────────────────────────
  if (assets.topBanner) ctx.drawImage(assets.topBanner, 0, 0, w, h);

  // ── 8. YOUTHCARDS text — banner centre x=531, y=54 ───────
  ctx.save();
  ctx.font = `bold ${Math.round(30 * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('YOUTHCARDS', 531 * sx, 54 * sy);
  ctx.restore();

  // ── 9. Nameplate ─────────────────────────────────────────
  if (assets.nameplate) ctx.drawImage(assets.nameplate, 0, 0, w, h);

  // ── 10. Player name ───────────────────────────────────────
  // Name zone sits between nameplate dividers at y=1069 and y=1187.
  // Zone centre: (1069+1187)/2 = 1128.
  const pName = (card.playerName || 'PLAYER NAME').toUpperCase();
  const maxNameW = 790 * sx;
  let namePx = 76;
  ctx.font = `900 ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  while (ctx.measureText(pName).width > maxNameW && namePx > 22) {
    namePx -= 2;
    ctx.font = `900 ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  }
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pName, 530 * sx, 1128 * sy);
  ctx.restore();

  // ── 11. Team · Position ───────────────────────────────────
  // Illuminated channel sits between nameplate divider bands y=1195 and y=1274.
  // Channel centre: (1195+1274)/2 = 1234.
  const subLine = [card.teamName, card.position].filter(Boolean).join('  ·  ').toUpperCase();
  ctx.save();
  ctx.font = `600 ${Math.round(26 * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = '#c8a84b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(4 * sx)}px`;
  ctx.fillText(subLine || 'TEAM  ·  POSITION', 530 * sx, 1222 * sy);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();

  // ── 12. Stat panel ───────────────────────────────────────
  if (assets.statPanel) ctx.drawImage(assets.statPanel, 0, 0, w, h);

  // ── 13. Stats ────────────────────────────────────────────
  // Stat panel: x[225-825] y[1249-1406], height=157px.
  // Box divider gaps at x≈415 and x≈645 → column centres: [315, 530, 740].
  // Equal top/bottom padding (≈31px each) with 24px label + 54px value + 16px gap:
  //   label centre y = 1249 + 31 + 12 = 1292
  //   value centre y = 1249 + 31 + 24 + 16 + 27 = 1347
  if (card.sport && SPORT_STATS[card.sport]) {
    const statCX = [315, 530, 740];
    const stats3 = SPORT_STATS[card.sport].slice(0, 3);
    stats3.forEach((stat, i) => {
      const cx = statCX[i] * sx;
      const val = card.showStats ? ((card.stats || {})[stat.key] || '—') : '—';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(24 * sx)}px "Oswald", sans-serif`;
      ctx.fillStyle = '#c8a84b';
      ctx.fillText(stat.label, cx, 1292 * sy);
      ctx.font = `900 ${Math.round(54 * sx)}px "Oswald", "Arial Black", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(val, cx, 1347 * sy);
      ctx.restore();
    });
  }

  // ── 14. NFC icon (asset only — no text overlay) ──────────
  if (assets.nfcIcon) ctx.drawImage(assets.nfcIcon, 0, 0, w, h);
}

function drawFuturisticBack(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  logoImg: HTMLImageElement | null,
  assets: Partial<Record<string, HTMLImageElement>>
) {
  const FUT_W = 1060, FUT_H = 1484;
  const sx = w / FUT_W;
  const sy = h / FUT_H;

  // ── 1. Background ────────────────────────────────────────
  if (assets.backBg) {
    ctx.drawImage(assets.backBg, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#06010a';
    ctx.fillRect(0, 0, w, h);
  }

  // ── 2. Frame ─────────────────────────────────────────────
  if (assets.backFrame) ctx.drawImage(assets.backFrame, 0, 0, w, h);

  // ── 3. Team logo — zone cx=530 cy=209 maxW=300 maxH=280 ──
  if (logoImg) {
    const maxW = 300 * sx, maxH = 280 * sy;
    const fit = Math.min(maxW / logoImg.width, maxH / logoImg.height);
    const dw = logoImg.width * fit, dh = logoImg.height * fit;
    ctx.drawImage(logoImg, 530 * sx - dw / 2, 209 * sy - dh / 2, dw, dh);
  } else if (card.sport) {
    ctx.font = `${Math.round(80 * sx)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SPORT_INFO[card.sport].icon, 530 * sx, 209 * sy);
    ctx.textBaseline = 'alphabetic';
  }

  // ── 4. Player name — cy=364, italic gold with gray outline ─
  const pName = (card.playerName || 'PLAYER NAME').toUpperCase();
  const maxNameW = 920 * sx;
  let namePx = 88;
  ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  while (ctx.measureText(pName).width > maxNameW && namePx > 36) {
    namePx -= 2;
    ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = Math.round(4 * sx);
  ctx.strokeText(pName, 530 * sx, 364 * sy);
  ctx.fillStyle = '#C8A84B';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8 * sx;
  ctx.shadowOffsetX = 2 * sx;
  ctx.shadowOffsetY = 3 * sy;
  ctx.fillText(pName, 530 * sx, 364 * sy);
  ctx.restore();

  // ── 5. Position line — cy=451, red spaced caps ────────────
  const posLine = [card.position, card.jerseyNumber ? `#${card.jerseyNumber}` : '']
    .filter(Boolean).join('  •  ').toUpperCase();
  ctx.save();
  ctx.font = `600 ${Math.round(28 * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = '#E53935';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(5 * sx)}px`;
  ctx.fillText(posLine || 'POSITION  •  #00', 530 * sx, 451 * sy);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();

  // ── 6. Section dividers — draw asset for the top glow line (zone 1, y=488–516).
  // The asset also has 4 lines of baked placeholder text (zones 2–5, y=553–704).
  // When the user has typed bio text, erase those baked lines by repainting the
  // background over the bio zone so only the user's text shows.
  // Erase ALL baked white placeholder text from section-dividers (y=553–750 canonical).
  // Full scan: y=553–706 = 4 bio text lines, y=722–750 = "makes the right play every time."
  // True glow elements: orange line y=488–516 (above erase), thin line y=795–797 (below erase).
  if (assets.backBg) {
    ctx.drawImage(assets.backBg, 0, 530, FUT_W, 230, 0, Math.round(530 * sy), w, Math.round(230 * sy));
  }
  // Restore frame borders that the background repaint covered — frame interior is transparent
  // so the zone-1 glow line (y=488–516) remains visible underneath
  if (assets.backFrame) ctx.drawImage(assets.backFrame, 0, 0, w, h);

  // ── 7. Bio text — left-aligned, each line on its glow zone cy=[567,609,651,692]
  if (card.backText) {
    ctx.save();
    ctx.font = `400 ${Math.round(32 * sx)}px "Saira", sans-serif`;
    ctx.fillStyle = '#F2F2F2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const bioLineY = [567, 609, 651, 692];
    const bioLines = wrapText(ctx, card.backText, 910 * sx);
    bioLines.slice(0, 4).forEach((line, i) => {
      ctx.fillText(line, 75 * sx, bioLineY[i] * sy);
    });
    ctx.restore();
  }

  // ── 8. Stat box frames ────────────────────────────────────
  if (assets.backStatBoxes) ctx.drawImage(assets.backStatBoxes, 0, 0, w, h);

  // ── 9 & 10. Stat labels + values ─────────────────────────
  // Box centres cx=[288,533,775] | label cy=859 | value cy=914
  if (card.sport && SPORT_STATS[card.sport]) {
    const statCX = [288, 533, 775];
    SPORT_STATS[card.sport].slice(0, 3).forEach((stat, i) => {
      const cx = statCX[i] * sx;
      const val = card.showStats ? ((card.stats || {})[stat.key] || '—') : '—';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(22 * sx)}px "Oswald", sans-serif`;
      ctx.fillStyle = '#C8A84B';
      ctx.fillText(stat.label, cx, 859 * sy);
      ctx.font = `900 ${Math.round(58 * sx)}px "Oswald", "Arial Black", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(val, cx, 914 * sy);
      ctx.restore();
    });
  }

  // ── 11. Physical stats asset (icons + labels baked) ───────
  if (assets.backPhysStats) ctx.drawImage(assets.backPhysStats, 0, 0, w, h);

  // ── 12. Physical stat values — x=578, cy=[1029,1100,1173,1246]
  const physRows = [
    { val: card.height   || '—', cy: 1029 },
    { val: card.age      || '—', cy: 1100 },
    { val: card.classYear || '—', cy: 1173 },
    { val: (card.hometown || '—').toUpperCase(), cy: 1246 },
  ];
  ctx.save();
  ctx.font = `600 ${Math.round(32 * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  physRows.forEach(({ val, cy }) => {
    ctx.fillText(val, 580 * sx, cy * sy);
  });
  ctx.restore();

  // ── 13. Footer plate ──────────────────────────────────────
  if (assets.backFooter) ctx.drawImage(assets.backFooter, 0, 0, w, h);
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE 3: CHROME
// ═══════════════════════════════════════════════════════

function drawChromeBackground(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  const rgb = hexToRgb(accent);

  // Brushed metal base gradient
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#4a4a4a');
  base.addColorStop(0.1, '#6a6a6a');
  base.addColorStop(0.15, '#3a3a3a');
  base.addColorStop(0.3, '#5a5a5a');
  base.addColorStop(0.35, '#4a4a4a');
  base.addColorStop(0.5, '#6a6a6a');
  base.addColorStop(0.55, '#3a3a3a');
  base.addColorStop(0.7, '#5a5a5a');
  base.addColorStop(0.75, '#4a4a4a');
  base.addColorStop(0.9, '#5a5a5a');
  base.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = base;
  drawRoundedRect(ctx, 0, 0, w, h, 12);
  ctx.fill();

  // Brushed texture - horizontal lines
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < h; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.strokeStyle = y % 4 === 0 ? '#ffffff' : '#000000';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();

  // Chrome shine highlight
  ctx.save();
  const shine = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.3);
  shine.addColorStop(0, 'rgba(255,255,255,0.15)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  shine.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Accent color stripe bands
  ctx.save();
  // Top stripe
  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.fillRect(0, 0, w, h * 0.015);
  // Bottom stripe
  ctx.fillRect(0, h * 0.985, w, h * 0.015);
  // Side accent lines
  ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
  ctx.fillRect(0, 0, w * 0.008, h);
  ctx.fillRect(w * 0.992, 0, w * 0.008, h);
  ctx.restore();
}

function drawChromeFront(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  playerImg: HTMLImageElement | null, logoImg: HTMLImageElement | null
) {
  const accent = card.accentColor;
  const rgb = hexToRgb(accent);
  const sport = card.sport || 'baseball';
  const sportInfo = SPORT_INFO[sport];

  drawChromeBackground(ctx, w, h, accent);
  drawSportDecorChrome(ctx, sport, w, h);

  // Sport label top-left
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${w * 0.045}px "Oswald", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(sportInfo.label.toUpperCase(), w * 0.04, w * 0.08);
  ctx.restore();

  // Bold metallic border around photo
  const photoX = w * 0.08;
  const photoY = h * 0.09;
  const photoW = w * 0.84;
  const photoH = h * 0.5;

  // Outer metallic frame
  ctx.save();
  const framePad = 8;
  const frameGrad = ctx.createLinearGradient(photoX - framePad, photoY - framePad, photoX + photoW + framePad, photoY + photoH + framePad);
  frameGrad.addColorStop(0, '#888888');
  frameGrad.addColorStop(0.2, '#cccccc');
  frameGrad.addColorStop(0.4, '#666666');
  frameGrad.addColorStop(0.6, '#bbbbbb');
  frameGrad.addColorStop(0.8, '#777777');
  frameGrad.addColorStop(1, '#aaaaaa');
  ctx.fillStyle = frameGrad;
  drawRoundedRect(ctx, photoX - framePad, photoY - framePad, photoW + framePad * 2, photoH + framePad * 2, 6);
  ctx.fill();

  // Inner accent line
  ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, photoX - 2, photoY - 2, photoW + 4, photoH + 4, 3);
  ctx.stroke();
  ctx.restore();

  // Photo
  drawPlayerPhoto(ctx, playerImg, photoX, photoY, photoW, photoH, card.photoOffsetX, card.photoOffsetY, card.photoScale, 4);

  // Large dramatic player name — chrome metallic text
  const nameY = h * 0.67;
  ctx.save();

  // Text shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = `bold ${w * 0.1}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((card.playerName || 'PLAYER NAME').toUpperCase(), w / 2 + 2, nameY + 2);

  // Main text with metallic gradient
  const textGrad = ctx.createLinearGradient(0, nameY - w * 0.08, 0, nameY + w * 0.02);
  textGrad.addColorStop(0, '#ffffff');
  textGrad.addColorStop(0.3, '#dddddd');
  textGrad.addColorStop(0.5, '#ffffff');
  textGrad.addColorStop(0.7, '#bbbbbb');
  textGrad.addColorStop(1, '#e0e0e0');
  ctx.fillStyle = textGrad;
  ctx.fillText((card.playerName || 'PLAYER NAME').toUpperCase(), w / 2, nameY);
  ctx.restore();

  // Accent bar under name
  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.fillRect(w * 0.15, nameY + 8, w * 0.7, 3);

  // Position & Team
  ctx.fillStyle = '#ffffff';
  ctx.font = `${w * 0.04}px "Oswald", sans-serif`;
  ctx.textAlign = 'center';
  const posTeam = [card.position, card.teamName].filter(Boolean).join('  •  ');
  ctx.fillText(posTeam.toUpperCase() || 'POSITION • TEAM', w / 2, nameY + h * 0.05);

  // Jersey number — metallic badge top-right
  if (card.jerseyNumber) {
    ctx.save();
    const numX = w * 0.88;
    const numY = h * 0.04;
    const numW = w * 0.1;
    const numH = h * 0.055;
    // Chrome badge background
    const badgeGrad = ctx.createLinearGradient(numX, numY, numX, numY + numH);
    badgeGrad.addColorStop(0, '#999');
    badgeGrad.addColorStop(0.5, '#ddd');
    badgeGrad.addColorStop(1, '#888');
    ctx.fillStyle = badgeGrad;
    drawRoundedRect(ctx, numX, numY, numW, numH, 4);
    ctx.fill();
    ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, numX, numY, numW, numH, 4);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${w * 0.045}px "Oswald", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${card.jerseyNumber}`, numX + numW / 2, numY + numH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // NFC badge
  drawNfcBadge(ctx, w - 35, h - 35, 16, 'white');

  // Team logo
  if (logoImg) {
    const logoSize = w * 0.1;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(logoImg, 15, h - logoSize - 15, logoSize, logoSize);
    ctx.globalAlpha = 1;
  }

  // Branding
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `${w * 0.025}px "Oswald", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUTHCARDS', w / 2, h - 8);
}

function drawChromeBack(
  ctx: CanvasRenderingContext2D, card: CardData, w: number, h: number,
  logoImg: HTMLImageElement | null, backPhotoImg: HTMLImageElement | null
) {
  const accent = card.accentColor;
  const rgb = hexToRgb(accent);
  const hasBackPhoto = !!backPhotoImg;

  drawChromeBackground(ctx, w, h, accent);

  // Header
  ctx.save();
  const headerH = h * 0.12;
  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerH);
  headerGrad.addColorStop(0, '#333');
  headerGrad.addColorStop(0.5, '#555');
  headerGrad.addColorStop(1, '#333');
  ctx.fillStyle = headerGrad;
  drawRoundedRect(ctx, 0, 0, w, headerH + 4, 12);
  ctx.fill();
  ctx.fillRect(0, 12, w, headerH - 8);
  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.fillRect(0, headerH, w, 3);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${w * 0.07}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((card.playerName || 'PLAYER NAME').toUpperCase(), w / 2, headerH * 0.6);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `${w * 0.035}px "Oswald", sans-serif`;
  const subLine = [card.teamName, card.position, card.jerseyNumber ? `#${card.jerseyNumber}` : '']
    .filter(Boolean).join('  •  ');
  ctx.fillText(subLine || 'Team • Position', w / 2, headerH * 0.9);

  // Back photo
  let contentY = h * 0.14;
  if (hasBackPhoto) {
    const frameSize = w * 0.4;
    drawBackPhoto(ctx, card, w, h, backPhotoImg, contentY + 8, frameSize,
      'rgba(255,255,255,0.3)');
    contentY += frameSize + 20;
  }

  // Team logo watermark
  if (logoImg) {
    const logoSize = w * (hasBackPhoto ? 0.25 : 0.45);
    const logoCenterY = hasBackPhoto ? contentY + logoSize * 0.3 : h * 0.38;
    ctx.globalAlpha = hasBackPhoto ? 0.1 : 0.2;
    ctx.drawImage(logoImg, w / 2 - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
    ctx.globalAlpha = 1;
  }

  // Info section
  const infoY = hasBackPhoto ? contentY + 10 : h * 0.64;

  ctx.save();
  const teamGrad = ctx.createLinearGradient(0, infoY - w * 0.06, 0, infoY);
  teamGrad.addColorStop(0, '#ffffff');
  teamGrad.addColorStop(0.5, '#dddddd');
  teamGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = teamGrad;
  ctx.font = `bold ${w * 0.055}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((card.teamName || 'TEAM NAME').toUpperCase(), w / 2, infoY);
  ctx.restore();

  const divGrad = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, 0);
  divGrad.addColorStop(0, 'rgba(255,255,255,0)');
  divGrad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  divGrad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  divGrad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  divGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(w * 0.15, infoY + 10, w * 0.7, 1.5);

  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctx.font = `bold ${w * 0.045}px "Oswald", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  const posNum = [card.position, card.jerseyNumber ? `#${card.jerseyNumber}` : ''].filter(Boolean).join('  •  ');
  ctx.fillText(posNum || 'Position • #00', w / 2, infoY + h * 0.05);

  // Stats section
  let nextY = infoY + h * 0.08;
  nextY = drawStatsSection(ctx, card, w, nextY, 'chrome', accent);

  // Back text
  if (card.backText) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `italic ${w * 0.033}px "Oswald", Arial, sans-serif`;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, card.backText, w * 0.8);
    const lineHeight = w * 0.043;
    lines.slice(0, 5).forEach((line, i) => {
      ctx.fillText(line, w / 2, nextY + i * lineHeight);
    });
  }

  // NFC badge
  drawNfcBadge(ctx, w / 2, h * 0.88, 18, 'white');

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `${w * 0.025}px "Oswald", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUTHCARDS.COM  •  NFC-ENABLED  •  CHROME EDITION', w / 2, h - 10);
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE: GALAXY HOLO
// ═══════════════════════════════════════════════════════

// All coordinates in GH_W × GH_H (1054 × 1492) space — derived from pixel scans of PNGs
const GH_LAYOUT = {
  numberBox:   { x: 790, y: 105, w: 125, h: 70 },
  positionBox: { x: 790, y: 175, w: 125, h: 40 },
  name:        { cx: 527, cy: 1002 },  // 04_bottom_ui.png banner center (rows 914–1090)
  subtitle:    { cx: 527, cy: 1050 },  // lower portion of name banner
  statBoxes: [
    { x: 133, y: 1104, w: 252, h: 163 },  // 05_stat_boxes.png scan: x 133–385, rows 1104–1267
    { x: 401, y: 1104, w: 250, h: 163 },  // x 401–651
    { x: 666, y: 1104, w: 252, h: 163 },  // x 666–918
  ],
};

// Per-sport stat definitions for Galaxy Holo (label shown on card may differ from builder label)
const GH_SPORT_STATS: Record<string, { key: string; label: string }[]> = {
  baseball:   [{ key: 'avg', label: 'AVG' },   { key: 'rbi',     label: 'RBI' },     { key: 'hr',  label: 'HR'  }],
  basketball: [{ key: 'ppg', label: 'PTS' },   { key: 'rpg',     label: 'REB' },     { key: 'apg', label: 'AST' }],
  soccer:     [{ key: 'goals', label: 'GOALS' },{ key: 'assists', label: 'ASSISTS' }, { key: 'apps',label: 'APPS'}],
  football:   [{ key: 'yds', label: 'YDS' },   { key: 'td',      label: 'TD' },      { key: 'tkl', label: 'TCK' }],
};

// Typography color configs keyed by the hex values used in ACCENT_COLORS swatch
const GALAXY_HOLO_COLORS: Record<string, {
  nameGradient: [string, string];
  meta: string;
  jerseyNumber: string;
  jerseyGlow: string;
  statLabel: string;
  statValue: string;
}> = {
  '#DC2626': { nameGradient: ['#FB7185', '#FDBA74'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(251,113,133,0.40)', statLabel: '#991B1B', statValue: '#000000' },
  '#EA580C': { nameGradient: ['#FB923C', '#FDE68A'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(251,146,60,0.40)',  statLabel: '#9A3412', statValue: '#000000' },
  '#D97706': { nameGradient: ['#FBBF24', '#FDE68A'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(251,191,36,0.40)',  statLabel: '#92400E', statValue: '#000000' },
  '#16A34A': { nameGradient: ['#4ADE80', '#A7F3D0'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(74,222,128,0.40)',  statLabel: '#166534', statValue: '#000000' },
  '#0891B2': { nameGradient: ['#38BDF8', '#A5F3FC'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(56,189,248,0.40)',  statLabel: '#0E7490', statValue: '#000000' },
  '#2563EB': { nameGradient: ['#60A5FA', '#A5F3FC'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(96,165,250,0.40)',  statLabel: '#1D4ED8', statValue: '#000000' },
  '#7C3AED': { nameGradient: ['#C084FC', '#F0ABFC'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(192,132,252,0.40)', statLabel: '#7E22CE', statValue: '#000000' },
  '#DB2777': { nameGradient: ['#F472B6', '#FBCFE8'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(244,114,182,0.40)', statLabel: '#BE185D', statValue: '#000000' },
  '#000000': { nameGradient: ['#111827', '#6B7280'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(107,114,128,0.40)', statLabel: '#111827', statValue: '#000000' },
  '#FFFFFF': { nameGradient: ['#FFFFFF', '#BAE6FD'], meta: '#111827', jerseyNumber: '#111827', jerseyGlow: 'rgba(255,255,255,0.50)', statLabel: '#111827', statValue: '#000000' },
};
// Default = pink→cyan reference look (matches Jayden Reyes reference card)
const GH_DEFAULT_COLORS = {
  nameGradient: ['#E879F9', '#67E8F9'] as [string, string],
  meta: '#111827',
  jerseyNumber: '#111827',
  jerseyGlow: 'rgba(232,121,249,0.45)',
  statLabel: '#111827',
  statValue: '#000000',
};

function ghColors(accentColor: string) {
  const key = accentColor.toUpperCase();
  return GALAXY_HOLO_COLORS[key] ?? GALAXY_HOLO_COLORS[accentColor] ?? GH_DEFAULT_COLORS;
}

// Returns true for full-canvas GH-sized transparent cutouts
function isGhCutout(img: HTMLImageElement): boolean {
  return img.width > 400 && Math.abs(img.width / img.height - GH_W / GH_H) < 0.04;
}

function drawGalaxyHoloFront(
  ctx: CanvasRenderingContext2D,
  card: CardData,
  w: number,
  h: number,
  playerImg: HTMLImageElement | null,
  logoImg: HTMLImageElement | null,
  ghImgs: Partial<Record<string, HTMLImageElement>>
) {
  const sx = w / GH_W;
  const sy = h / GH_H;
  const L = GH_LAYOUT;
  const cutout = playerImg && isGhCutout(playerImg);

  // ── Layer 01: Galaxy background ──
  if (ghImgs.ghBase) {
    ctx.drawImage(ghImgs.ghBase, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);
  }

  // ── User photo (non-cutout): drawn before frame so UI layers sit on top ──
  if (playerImg && !cutout) {
    const pz = { x: 25, y: 20, w: 1004, h: 755 };
    const px = Math.round(pz.x * sx), py = Math.round(pz.y * sy);
    const pw = Math.round(pz.w * sx), ph = Math.round(pz.h * sy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    const s = Math.max(pw / playerImg.naturalWidth, ph / playerImg.naturalHeight) * (card.photoScale || 1);
    const iw = playerImg.naturalWidth * s, ih = playerImg.naturalHeight * s;
    ctx.drawImage(playerImg,
      px + pw / 2 - iw / 2 + (card.photoOffsetX || 0) * sx,
      py + ph / 2 - ih / 2 + (card.photoOffsetY || 0) * sy,
      iw, ih);
    ctx.restore();
  }

  // ── Layer 02: Frame components (top arch + side pillars) ──
  if (ghImgs.ghFrame) ctx.drawImage(ghImgs.ghFrame, 0, 0, w, h);

  // ── Layer 03: Top header (YOUTHCARDS — baked into PNG) ──
  if (ghImgs.ghHeader) ctx.drawImage(ghImgs.ghHeader, 0, 0, w, h);

  // ── Layer 04: Bottom UI (name banner plate) ──
  if (ghImgs.ghBottomUI) ctx.drawImage(ghImgs.ghBottomUI, 0, 0, w, h);

  // ── Layer 05: Stat box frames ──
  if (ghImgs.ghStatBoxes) ctx.drawImage(ghImgs.ghStatBoxes, 0, 0, w, h);

  // ── Layer 06: Player cutout — breakout effect (drawn above stat boxes) ──
  if (cutout) {
    ctx.save();
    const s = card.photoScale || 1;
    const dw = w * s, dh = h * s;
    const ox = (w - dw) / 2 + (card.photoOffsetX || 0) * sx;
    const oy = (h - dh) / 2 + (card.photoOffsetY || 0) * sy;
    ctx.drawImage(playerImg!, ox, oy, dw, dh);
    ctx.restore();
  }

  // ── Layer 07: Dynamic content ──

  const ghC = ghColors(card.accentColor);

  // Jersey number — centered in bounding box
  {
    const nb = L.numberBox;
    const cx = (nb.x + nb.w / 2) * sx;
    const cy = (nb.y + nb.h / 2) * sy;
    const maxW = nb.w * sx;
    const numText = card.jerseyNumber || '00';
    let numPx = 72;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(numPx * sx)}px "Oswald", "Arial Black", sans-serif`;
    while (ctx.measureText(numText).width > maxW && numPx > 16) {
      numPx -= 2;
      ctx.font = `900 ${Math.round(numPx * sx)}px "Oswald", "Arial Black", sans-serif`;
    }
    ctx.shadowColor = ghC.jerseyGlow;
    ctx.shadowBlur = 8 * sx;
    ctx.fillStyle = ghC.jerseyNumber;
    ctx.fillText(numText, cx, cy);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Position abbreviation — centered in bounding box
  {
    const pb = L.positionBox;
    const cx = (pb.x + pb.w / 2) * sx;
    const cy = (pb.y + pb.h / 2) * sy;
    const maxW = pb.w * sx;
    const posText = (card.position || 'POS').toUpperCase();
    let posPx = 36;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(posPx * sx)}px "Oswald", sans-serif`;
    while (ctx.measureText(posText).width > maxW && posPx > 12) {
      posPx -= 2;
      ctx.font = `700 ${Math.round(posPx * sx)}px "Oswald", sans-serif`;
    }
    ctx.fillStyle = ghC.meta;
    ctx.fillText(posText, cx, cy);
    ctx.restore();
  }

  // Player name — 2-pass fill for Canva-like distinction, no stroke/outline
  ctx.save();
  let namePx = 102;
  const nameText = (card.playerName || 'PLAYER NAME').toUpperCase();
  const nameCX = Math.round(L.name.cx * sx);
  const maxNameW = 960 * sx;
  ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  while (ctx.measureText(nameText).width > maxNameW && namePx > 36) {
    namePx -= 2;
    ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameCY = Math.round(L.name.cy * sy) - Math.round(6 * sy);
  const nameW2 = ctx.measureText(nameText).width;
  const nameGradX0 = nameCX - nameW2 / 2;
  const nameGradX1 = nameCX + nameW2 / 2;
  // Pass 1 — dark underpaint for depth (no stroke)
  ctx.shadowColor   = 'rgba(10,12,24,0.55)';
  ctx.shadowBlur    = Math.round(12 * sx);
  ctx.shadowOffsetY = Math.round(3  * sy);
  ctx.fillStyle = 'rgba(10,12,24,0.38)';
  ctx.fillText(nameText, nameCX, nameCY);
  // Pass 2 — main gradient fill
  ctx.shadowBlur    = Math.round(4 * sx);
  ctx.shadowOffsetY = Math.round(1 * sy);
  const nameGrad = ctx.createLinearGradient(nameGradX0, 0, nameGradX1, 0);
  nameGrad.addColorStop(0,    '#C77DFF');
  nameGrad.addColorStop(0.5,  '#F38BB8');
  nameGrad.addColorStop(1,    '#B7F3E8');
  ctx.fillStyle = nameGrad;
  ctx.fillText(nameText, nameCX, nameCY);
  ctx.shadowColor = 'transparent';
  ctx.restore();

  // Subtitle — position • location
  ctx.save();
  ctx.font = `600 ${Math.round(38 * sx)}px "Oswald", sans-serif`;
  ctx.fillStyle = ghC.meta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const subParts = [card.position, card.hometown].filter(Boolean).map(s => s!.toUpperCase());
  ctx.fillText(subParts.length ? subParts.join(' • ') : 'POSITION • LOCATION', Math.round(L.subtitle.cx * sx), Math.round(L.subtitle.cy * sy));
  ctx.restore();

  // Stat labels + values — each centered inside its own bounding box
  if (card.sport) {
    const sportStats = GH_SPORT_STATS[card.sport] ?? [];
    sportStats.forEach((stat, i) => {
      const box = L.statBoxes[i];
      if (!box) return;
      const cx  = (box.x + box.w / 2) * sx;
      const labelCY = (box.y + 38) * sy;  // upper portion of 163px box
      const valueCY = (box.y + 108) * sy; // lower-center of 163px box
      const maxW = box.w * sx;
      const val = card.showStats ? ((card.stats || {})[stat.key] || '—') : '—';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Label
      let labelPx = 30;
      ctx.font = `700 ${Math.round(labelPx * sx)}px "Oswald", sans-serif`;
      while (ctx.measureText(stat.label).width > maxW && labelPx > 10) {
        labelPx -= 1;
        ctx.font = `700 ${Math.round(labelPx * sx)}px "Oswald", sans-serif`;
      }
      ctx.fillStyle = ghC.statLabel;
      ctx.fillText(stat.label, cx, labelCY);
      // Value
      let valuePx = 58;
      ctx.font = `900 ${Math.round(valuePx * sx)}px "Oswald", "Arial Black", sans-serif`;
      while (ctx.measureText(val).width > maxW && valuePx > 14) {
        valuePx -= 2;
        ctx.font = `900 ${Math.round(valuePx * sx)}px "Oswald", "Arial Black", sans-serif`;
      }
      ctx.fillStyle = ghC.statValue;
      ctx.fillText(val, cx, valueCY);
      ctx.restore();
    });
  }

  // NFC icon asset
  if (ghImgs.ghNfc) ctx.drawImage(ghImgs.ghNfc, 0, 0, w, h);

  // Team logo — contain-fit centered in badge zone (top-left, inside frame)
  if (logoImg) {
    const GH_LOGO_ZONE = { cx: 168, cy: 230, maxW: 168, maxH: 168 };
    const fit = Math.min(
      (GH_LOGO_ZONE.maxW * sx) / logoImg.naturalWidth,
      (GH_LOGO_ZONE.maxH * sy) / logoImg.naturalHeight,
    );
    const dw = logoImg.naturalWidth  * fit;
    const dh = logoImg.naturalHeight * fit;
    const dxRaw = GH_LOGO_ZONE.cx * sx - dw / 2;
    const dyRaw = GH_LOGO_ZONE.cy * sy - dh / 2;
    // Clamp so logo stays inside safe bounds regardless of aspect ratio
    const dx = Math.min(Math.max(dxRaw, 88 * sx),  330 * sx - dw);
    const dy = Math.min(Math.max(dyRaw, 132 * sy), 322 * sy - dh);
    ctx.drawImage(logoImg, dx, dy, dw, dh);
  }
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE: CHROME LEGACY
// ═══════════════════════════════════════════════════════

// Canvas coordinate space for all Chrome Legacy layer images
const CHL_W = 1024;
const CHL_H = 1536;

// All positions in CHL_W x CHL_H space — scaled at render time
// Nameplate bar PNG sits at ~60-73% canvas height; stat boxes PNG at ~77-91%
const CHL_LAYOUT = {
  numberBox:  { cx: 855, cy: 173, maxW: 124 },
  playerName: { cx: 512, cy: 1020, maxW: 840 },  // upper portion of nameplate bar
  subtitle:   { cx: 512, cy: 1112 },             // lower portion of nameplate bar
  statBoxes: [
    { cx: 256, labelCY: 1262, valueCY: 1326, maxW: 210 },
    { cx: 512, labelCY: 1262, valueCY: 1326, maxW: 210 },
    { cx: 768, labelCY: 1262, valueCY: 1326, maxW: 210 },
  ],
};

const CHL_SPORT_STATS: Record<string, { key: string; label: string }[]> = {
  baseball:   [{ key: 'avg',    label: 'AVG'   }, { key: 'rbi',     label: 'RBI' }, { key: 'hr',   label: 'HR'  }],
  basketball: [{ key: 'ppg',   label: 'PTS'   }, { key: 'rpg',     label: 'REB' }, { key: 'apg',  label: 'AST' }],
  soccer:     [{ key: 'goals', label: 'GOALS' }, { key: 'assists', label: 'AST' }, { key: 'apps', label: 'APP' }],
  football:   [{ key: 'yds',   label: 'YDS'   }, { key: 'td',      label: 'TD'  }, { key: 'tkl',  label: 'TCK' }],
};

// ─── Chrome Legacy back coordinate space (from CHROME_LEGACY_BACK_CANVAS) ───
const CHLB_W = CHROME_LEGACY_BACK_CANVAS.width;   // 1054
const CHLB_H = CHROME_LEGACY_BACK_CANVAS.height;  // 1492

// All positions in CHLB_W × CHLB_H space — scaled at render time.
// Sections top→bottom: brand header · player name · story · DNA · NFC/unlock · collection footer.
const CHLB_LAYOUT = {
  brandLogo:     { cx: 527, cy: 90 },
  playerName:    { cx: 527, cy: 228, maxW: 900 },
  storyTitle:    { cx: 527, cy: 305 },
  storyText:     { cx: 527, startY: 345, lineH: 44, maxLines: 6, maxW: 894 },
  dnaTitle:      { cx: 527, cy: 638 },
  dnaRows:       [{ cy: 704 }, { cy: 766 }, { cy: 828 }, { cy: 890 }, { cy: 952 }],
  dnaLabelX:     100,
  dnaBarX:       340,
  dnaBarW:       540,
  dnaBarH:       20,
  dnaScoreX:     960,
  nfcPanel:      { x: 60, y: 1008, w: 934, h: 340 },
  nfcBadge:      { cx: 143, cy: 1055 },
  unlockTitle:   { cx: 527, cy: 1055 },
  unlockItems:   [{ cy: 1112 }, { cy: 1162 }, { cy: 1212 }, { cy: 1262 }, { cy: 1312 }],
  unlockItemX:   160,
  collectionName:{ cx: 527, cy: 1435 },
};

// DNA trait defaults — schema example values (chromeLegacyBackSchema.json example_payload).
// Rendered when card model has no trait scores; scores map to DATA_DNA_*_SCORE layers.
const CHLB_DNA_DEFAULTS = [
  { label: 'LEADERSHIP',        score: 5 },
  { label: 'WORK ETHIC',        score: 5 },
  { label: 'COACHABILITY',      score: 4 },
  { label: 'COMPETITIVE DRIVE', score: 5 },
  { label: 'TEAM FIRST',        score: 5 },
];

// DATA_UNLOCK_ITEM_*_LABEL defaults (5 rows matching schema example_payload).
const CHLB_UNLOCK_DEFAULTS = [
  'FULL ATHLETE PROFILE',
  'SOCIAL LINKS',
  'VIDEO HIGHLIGHTS',
  'EXCLUSIVE CONTENT',
  'LATEST UPDATES',
];

function drawChromeLegacyFront(
  ctx: CanvasRenderingContext2D,
  card: CardData,
  w: number,
  h: number,
  playerImg: HTMLImageElement | null,
  logoImg: HTMLImageElement | null,
  chlImgs: Partial<Record<string, HTMLImageElement>>
) {
  const sx = w / CHL_W;
  const sy = h / CHL_H;
  const L  = CHL_LAYOUT;

  // sideTab OFF: baked "17" in side-tab.png would double the dynamic number
  // logoOverlay OFF: 23.png has faint right-side elements that create ghost text near number zone
  const chromeLegacyOverlayOptions = { sideTab: false, topBadge: true, logoOverlay: false };

  // 1. Chrome metal texture (base layer)
  if (chlImgs.chlMetal) {
    ctx.drawImage(chlImgs.chlMetal, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, w, h);
  }

  // 2. Stadium background
  if (chlImgs.chlBg) ctx.drawImage(chlImgs.chlBg, 0, 0, w, h);

  // 3. Chrome frame
  if (chlImgs.chlFrame) ctx.drawImage(chlImgs.chlFrame, 0, 0, w, h);

  // 4. Player photo — clipped to upper card zone
  if (playerImg) {
    const pz = { x: 50, y: 85, w: 924, h: 1060 };
    const px = pz.x * sx, py = pz.y * sy;
    const pw = pz.w * sx, ph = pz.h * sy;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    const s = Math.max(pw / playerImg.naturalWidth, ph / playerImg.naturalHeight) * (card.photoScale || 1);
    const iw = playerImg.naturalWidth  * s;
    const ih = playerImg.naturalHeight * s;
    ctx.drawImage(playerImg,
      px + pw / 2 - iw / 2 + (card.photoOffsetX || 0) * sx,
      py + ph / 2 - ih / 2 + (card.photoOffsetY || 0) * sy,
      iw, ih);
    ctx.restore();
  }

  // 5. Dynamic text

  // Jersey number — top-right
  {
    const numText = card.jerseyNumber || '00';
    let numPx = 80;
    const maxW = L.numberBox.maxW * sx;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(numPx * sx)}px "Oswald", "Arial Black", sans-serif`;
    while (ctx.measureText(numText).width > maxW && numPx > 16) {
      numPx -= 2;
      ctx.font = `900 ${Math.round(numPx * sx)}px "Oswald", "Arial Black", sans-serif`;
    }
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur  = Math.round(8 * sx);
    ctx.lineWidth = Math.max(2, 4 * sx);
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(numText, L.numberBox.cx * sx, L.numberBox.cy * sy);
    ctx.fillStyle   = '#B8C0CC';
    ctx.fillText(numText, L.numberBox.cx * sx, L.numberBox.cy * sy);
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  // Player name — centered in nameplate bar zone
  {
    const nameText = (card.playerName || 'PLAYER NAME').toUpperCase();
    let namePx = 88;
    const maxW = L.playerName.maxW * sx;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
    while (ctx.measureText(nameText).width > maxW && namePx > 30) {
      namePx -= 2;
      ctx.font = `900 italic ${Math.round(namePx * sx)}px "Oswald", "Arial Black", sans-serif`;
    }
    ctx.shadowColor   = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur    = Math.round(10 * sx);
    ctx.shadowOffsetY = Math.round(2  * sy);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(nameText, L.playerName.cx * sx, L.playerName.cy * sy);
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
  }

  // Subtitle — team and position, aligned with the other front-card renderers.
  {
    const parts   = [card.teamName, card.position].filter(Boolean).map(s => s!.toUpperCase());
    const subText = parts.length ? parts.join('  •  ') : 'TEAM  •  POSITION';
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(34 * sx)}px "Oswald", sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur  = Math.round(6 * sx);
    ctx.fillStyle   = 'rgba(210,210,215,0.92)';
    ctx.fillText(subText, L.subtitle.cx * sx, L.subtitle.cy * sy);
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  // 6. Nameplate chrome bar — frames the name/subtitle text above
  if (chlImgs.chlNameplate) ctx.drawImage(chlImgs.chlNameplate, 0, 0, w, h);

  // 7. Dynamic stat labels + values
  if (card.sport) {
    const sportStats = CHL_SPORT_STATS[card.sport] ?? [];
    sportStats.slice(0, 3).forEach((stat, i) => {
      const box    = L.statBoxes[i];
      if (!box) return;
      const cx     = box.cx      * sx;
      const labelY = box.labelCY * sy;
      const valueY = box.valueCY * sy;
      const maxW   = box.maxW    * sx;
      const val    = card.showStats ? ((card.stats || {})[stat.key] || '—') : '—';

      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      let labelPx = 32;
      ctx.font = `900 ${Math.round(labelPx * sx)}px "Oswald", "Arial Black", sans-serif`;
      while (ctx.measureText(stat.label).width > maxW && labelPx > 10) {
        labelPx -= 1;
        ctx.font = `900 ${Math.round(labelPx * sx)}px "Oswald", "Arial Black", sans-serif`;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = Math.round(4 * sx);
      ctx.fillText(stat.label, cx, labelY);
      ctx.shadowBlur = 0;

      let valuePx = 86;
      ctx.font = `900 italic ${Math.round(valuePx * sx)}px "Oswald", "Arial Black", sans-serif`;
      while (ctx.measureText(val).width > maxW && valuePx > 16) {
        valuePx -= 2;
        ctx.font = `900 italic ${Math.round(valuePx * sx)}px "Oswald", "Arial Black", sans-serif`;
      }
      ctx.lineWidth = Math.max(2, 4 * sx);
      ctx.strokeStyle = '#FFFFFF';
      ctx.strokeText(val, cx, valueY);
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur  = Math.round(6 * sx);
      ctx.fillStyle   = '#B8C0CC';
      ctx.fillText(val, cx, valueY);
      ctx.shadowBlur  = 0;
      ctx.restore();
    });
  }

  // 8. Stat box chrome frames (drawn over stat text as decorative border)
  if (chlImgs.chlStatBox) ctx.drawImage(chlImgs.chlStatBox, 0, 0, w, h);

  // 9. Bottom chrome plate
  if (chlImgs.chlBottomPlate) ctx.drawImage(chlImgs.chlBottomPlate, 0, 0, w, h);

  // 10. NFC side tab
  if (chlImgs.chlNfcTab) ctx.drawImage(chlImgs.chlNfcTab, 0, 0, w, h);

  // 11. Optional overlays
  if (chromeLegacyOverlayOptions.sideTab     && chlImgs.chlSideTab)     ctx.drawImage(chlImgs.chlSideTab,     0, 0, w, h);
  if (chromeLegacyOverlayOptions.topBadge    && chlImgs.chlTopBadge)    ctx.drawImage(chlImgs.chlTopBadge,    0, 0, w, h);
  if (chromeLegacyOverlayOptions.logoOverlay && chlImgs.chlLogoOverlay) ctx.drawImage(chlImgs.chlLogoOverlay, 0, 0, w, h);

  // Team logo — contain-fit centered inside zone, clipped to rounded rect
  if (logoImg) {
    const CHL_LOGO_ZONE = { x: 105, y: 118, w: 190, h: 190 };
    const zx = CHL_LOGO_ZONE.x * sx;
    const zy = CHL_LOGO_ZONE.y * sy;
    const zw = CHL_LOGO_ZONE.w * sx;
    const zh = CHL_LOGO_ZONE.h * sy;
    const fit = Math.min(zw / logoImg.naturalWidth, zh / logoImg.naturalHeight);
    const dw  = logoImg.naturalWidth  * fit;
    const dh  = logoImg.naturalHeight * fit;
    const dx  = zx + (zw - dw) / 2;
    const dy  = zy + (zh - dh) / 2;
    const r   = 8 * Math.min(sx, sy);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(zx, zy, zw, zh, r);
    ctx.clip();
    ctx.drawImage(logoImg, dx, dy, dw, dh);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════
//  TEMPLATE: CHROME LEGACY — BACK
// ═══════════════════════════════════════════════════════
//
// Canonical layer set — all from public/templates/chrome-legacy/back/
// Render order (bottom → top):
//   1  clbBase         dark bg + chrome frame border   (Untitled design 15)
//   2  [UPLOADED LOGO dynamic image]                 (Chrome back brand slot)
//   3  clbNameplate    section divider lines           (Untitled design 16)
//   4  [DATA_PLAYER_NAME dynamic text]
//   5  [DATA_ATHLETE_STORY dynamic text — centered into nameplate write area]
//   6  clbDnaHeader    "ATHLETE DNA" label baked       (Untitled design 24)
//   7  clbDnaRow1-5    icon + baked row labels/bars    (51–55)
//   8  clbNfcPanel     NFC container frame             (Untitled design 18)
//   9  clbNfcContent   TAP TO UNLOCK + baked labels    (Untitled design 23)
//  10  clbFooter       footer angular nameplate        (Untitled design 19)
//  11  [DATA_COLLECTION_NAME dynamic text]

// How far to shift the YC logo layer down (fraction of h).
// The player name cy is offset by the same amount so their gap is locked.
const CLB_BRAND_SHIFT = -0.004;

// ── Dynamic zone map (all values as fractions of the render canvas w / h) ──
// Tuned against reference: ChatGPT Image Jun 1, 2026, 06_01_39 PM.png
// No-overlap contract:
//   storyBody.bottom < dnaRows[0]  (story never bleeds into DNA)
//   dnaRows[4]       < nfcItems.rowFY[0]  (DNA never bleeds into NFC)
//   nfcItems.bottom  < footer.cy   (NFC items never overlap footer plate)
const CLB_ZONES = {
  // DATA_PLAYER_NAME — shifted down with the logo (CLB_BRAND_SHIFT applied to both)
  name: {
    cx:        0.500,
    cy:        0.240,
    maxW:      0.840,
    fontStart: 0.090,
    fontMin:   0.030,
  },
  // DATA_ATHLETE_STORY — centered into the nameplate writing area
  storyBody: {
    cx:     0.500,
    top:    0.302,
    bottom: 0.480,
  },
  // DATA_DNA_*_LABEL row y-centers — scaled to ~67% of original footprint, shifted up.
  // Span: 0.530→0.658 (12.8% h, was 18.4%).  Spacing: 0.032h per row (was 0.046h).
  // Constraint: dnaRows[4]=0.658 < nfcItems.rowFY[0]=0.860  (202px clearance at h=700).
  dnaRows:      [0.530, 0.562, 0.594, 0.626, 0.658],
  dnaLabelX:    0.246,
  dnaLabelMaxW: 0.296,
  // NFC unlock item text rows — calibrated to baked icon positions in layer 23
  nfcItems: {
    colX:   [0.368, 0.662],   // [left-col, right-col] label x-starts
    rowFY:  [0.860, 0.896, 0.930],  // 3 row y-fractions
    bottom: 0.944,            // hard floor — no item text below this
  },
  // DATA_COLLECTION_NAME — inside footer nameplate
  footer: {
    cx: 0.500,
    cy: 0.966,
  },
};

// Set true to draw translucent zone overlays for coordinate tuning.
const DEBUG_CHROME_BACK_ZONES = false;

// ── Chrome Legacy back: score-bar animation zone ──────────────────────────────
// These fractions describe where the baked parallelogram bars sit inside each
// DNA row layer (51-55). Tweak xLeft/xRight if the shimmer looks misaligned.
const CLB_BAR_ZONE = {
  xLeft:  0.548,   // left edge of bar column as fraction of w  ← adjust to taste
  xRight: 0.838,   // right edge                                ← adjust to taste
  height: 0.014,   // bar clip half-height as fraction of h  (was 0.022; scaled to ~65%)
};

// ── Chrome bar shimmer animation ─────────────────────────────────────────────
// Drives a staggered fill → chrome-shimmer sweep per row.
// animPhase: 0 = start, 1 = complete (stays at final brightened state).
// Speed: change TOTAL_MS (default 1400). Stagger: ROW_GAP (default 0.09 in phase units).
// Intensity: fillAlpha / shimmerAlpha below inside drawChromeLegacyBack.

interface ChrBackAnimState {
  frameId:   number | null;
  startTime: number;
  phase:     number;   // 0–1
}

function runChromeBackAnim(
  animRef: { current: ChrBackAnimState },
  drawFn:  () => void
) {
  if (animRef.current.frameId !== null) return; // already running
  const TOTAL_MS = 1400; // ← change to speed up / slow down entire animation
  animRef.current.startTime = performance.now();
  animRef.current.phase     = 0;

  function loop(now: number) {
    const elapsed = now - animRef.current.startTime;
    animRef.current.phase = Math.min(elapsed / TOTAL_MS, 1);
    drawFn(); // full redraw with updated phase
    if (animRef.current.phase < 1) {
      animRef.current.frameId = requestAnimationFrame(loop);
    } else {
      animRef.current.frameId = null;
    }
  }
  animRef.current.frameId = requestAnimationFrame(loop);
}

function drawChromeLegacyBack(
  ctx: CanvasRenderingContext2D,
  card: CardData,
  w: number,
  h: number,
  logoImg: HTMLImageElement | null,
  clbImgs: Partial<Record<string, HTMLImageElement>>,
  animPhase = 1   // 0 = start of animation, 1 = fully settled (default stable state)
) {
  const Z = CLB_ZONES;

  // Minimal fallback when base layer has not yet loaded.
  if (!clbImgs.clbBase) {
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, w, h);
  }

  // ── 1. FRAME_CHROME_OUTER_BORDER + dark background ──
  if (clbImgs.clbBase) ctx.drawImage(clbImgs.clbBase, 0, 0, w, h);

  // ── 2. Uploaded team logo — uses the Chrome back brand slot ──
  if (logoImg) {
    const maxW = w * 0.22;
    const maxH = w * 0.22;
    const fit = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
    const dw = logoImg.naturalWidth * fit;
    const dh = logoImg.naturalHeight * fit;
    const cx = w * 0.5;
    const cy = h * (0.104 + CLB_BRAND_SHIFT);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = Math.round(h * 0.012);
    ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }

  // ── 3. Section divider lines / nameplate structure ──
  // Story text and DNA rows both sit on this layer's visual panel areas.
  if (clbImgs.clbNameplate) ctx.drawImage(clbImgs.clbNameplate, 0, 0, w, h);

  // ── 4. DATA_PLAYER_NAME — largest dynamic text, italic chrome metallic ──
  {
    const nameText = (card.playerName || 'PLAYER NAME').toUpperCase();
    let namePx = Math.round(h * Z.name.fontStart);
    const maxNameW = w * Z.name.maxW;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 italic ${namePx}px "Oswald", "Arial Black", sans-serif`;
    while (ctx.measureText(nameText).width > maxNameW && namePx > Math.round(h * Z.name.fontMin)) {
      namePx -= 1;
      ctx.font = `900 italic ${namePx}px "Oswald", "Arial Black", sans-serif`;
    }
    const nameCY = h * Z.name.cy;
    const nameGrad = ctx.createLinearGradient(0, nameCY - namePx * 0.5, 0, nameCY + namePx * 0.5);
    nameGrad.addColorStop(0,    '#FFFFFF');
    nameGrad.addColorStop(0.28, '#D4D4D8');
    nameGrad.addColorStop(0.5,  '#FFFFFF');
    nameGrad.addColorStop(0.76, '#ADADB2');
    nameGrad.addColorStop(1,    '#E0E0E5');
    ctx.shadowColor = 'rgba(0,0,0,0.80)';
    ctx.shadowBlur = Math.round(h * 0.018);
    ctx.shadowOffsetY = Math.round(h * 0.003);
    ctx.fillStyle = nameGrad;
    ctx.fillText(nameText, w * Z.name.cx, nameCY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
  }

  // ── 5. COMPONENT_STORY_TITLE — removed (was static baked label, now story writes directly) ──

  // ── 6. DATA_ATHLETE_STORY — zone-clamped, character-break safe ──
  {
    const story = card.backText || '';
    if (story) {
      ctx.save();
      const zoneTop   = h * Z.storyBody.top;
      const zoneBot   = h * Z.storyBody.bottom;
      const availH    = zoneBot - zoneTop;
      const storyMaxW = w * 0.76;

      // Larger font for readability: 0.027h ≈ 18.9px at h=700
      let fontSize = Math.round(h * 0.027);
      let lineH    = Math.round(fontSize * 1.44);
      while (lineH > availH && fontSize > 9) { fontSize -= 1; lineH = Math.round(fontSize * 1.44); }

      const maxLines = Math.min(7, Math.floor(availH / lineH));
      ctx.font = `400 ${fontSize}px "Oswald", sans-serif`;
      ctx.fillStyle = 'rgba(210,210,215,0.90)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Word-wrap first pass, then character-break any line still wider than the zone.
      // This prevents long strings with no spaces from overflowing the card edge.
      const wordWrapped = wrapText(ctx, story, storyMaxW);
      const safeLines: string[] = [];
      for (const raw of wordWrapped) {
        if (ctx.measureText(raw).width <= storyMaxW) {
          safeLines.push(raw);
        } else {
          let chunk = '';
          for (const ch of raw) {
            if (ctx.measureText(chunk + ch).width > storyMaxW) {
              if (chunk) safeLines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          if (chunk) safeLines.push(chunk);
        }
      }

      const visible  = safeLines.slice(0, maxLines);
      const blockH   = visible.length * lineH;
      const blockTop = zoneTop + (availH - blockH) / 2;

      visible.forEach((line, i) => {
        const lineY = blockTop + lineH * 0.5 + i * lineH;
        if (lineY + lineH * 0.5 <= zoneBot) {
          ctx.fillText(line, w * Z.storyBody.cx, lineY);
        }
      });
      ctx.restore();
    }
  }

  // ── 7. COMPONENT_DNA_TITLE — clbDnaHeader excluded (Untitled design 24 contains
  //    baked "FOUNDING COLLECTION" text that duplicates the dynamic footer overlay) ──

  // ── 8. DNA BAR TRACKS — procedural ─────────────────────────────────────────
  // The baked dna-row-1…5 PNG draws are intentionally removed here to prevent
  // doubling with the dynamic animated bars in step 9b.
  // Files (chrome-legacy-back-dna-row-*.png) are kept on disk; only the
  // drawImage calls are disabled.  Step 9a draws the text labels; step 9b
  // draws the animated chrome fill + shimmer on top of these tracks.
  {
    const barLeft = w * CLB_BAR_ZONE.xLeft;
    const barW    = w * CLB_BAR_ZONE.xRight - barLeft;
    const barH    = h * CLB_BAR_ZONE.height;
    ctx.save();
    Z.dnaRows.forEach((rowFrac, i) => {
      const cy = h * rowFrac;
      // Empty bar track — dark glass background the fill animates over
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(barLeft, cy - barH / 2, barW, barH);
      // Hairline row-separator between rows (not after the last one)
      if (i < Z.dnaRows.length - 1) {
        const nextCY   = h * Z.dnaRows[i + 1];
        const sepY     = cy + (nextCY - cy) * 0.5;
        ctx.fillStyle  = 'rgba(255,255,255,0.05)';
        ctx.fillRect(w * 0.06, sepY - 0.5, w * 0.88, 1);
      }
    });
    ctx.restore();
  }

  // ── 9a. DATA_DNA_*_LABEL — one label per row, left of baked bars ──
  {
    const fontSize  = Math.round(h * 0.017);  // was 0.024; scaled to ~67%
    const labelX    = w * Z.dnaLabelX;
    const labelMaxW = w * Z.dnaLabelMaxW;
    ctx.save();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#FFFFFF';
    CHLB_DNA_DEFAULTS.forEach((trait, i) => {
      const rowY = h * Z.dnaRows[i];
      let px = fontSize;
      ctx.font = `600 ${px}px "Oswald", sans-serif`;
      while (ctx.measureText(trait.label).width > labelMaxW && px > 8) {
        px -= 1;
        ctx.font = `600 ${px}px "Oswald", sans-serif`;
      }
      ctx.fillText(trait.label, labelX, rowY);
    });
    ctx.restore();
  }

  // ── 9b. CHROME BAR SHIMMER (animPhase 0–1) ──────────────────────────────────
  // Staggered fill → shimmer sweep per row. animPhase=1 applies a permanent gleam.
  // Tune CLB_BAR_ZONE.xLeft/xRight if shimmer looks offset from the baked bars.
  // Tune fillAlpha/shimmerAlpha lines below for intensity.
  {
    const barLeft  = w * CLB_BAR_ZONE.xLeft;
    const barRight = w * CLB_BAR_ZONE.xRight;
    const barW     = barRight - barLeft;
    const barH     = h * CLB_BAR_ZONE.height;
    const NUM_ROWS  = 5;
    const ROW_GAP   = 0.09;  // phase units between row starts  ← tune stagger gap
    const ROW_DUR   = 0.52;  // phase units per row (fill + shimmer)

    if (animPhase >= 1) {
      // Settled state: subtle persistent chrome gleam across all bars
      ctx.save();
      Z.dnaRows.forEach((rowFrac) => {
        const cy = h * rowFrac;
        const glow = ctx.createLinearGradient(barLeft, 0, barRight, 0);
        glow.addColorStop(0,   'rgba(160,160,170,0.08)');
        glow.addColorStop(0.5, 'rgba(215,215,225,0.16)');  // ← shimmerAlpha (settled)
        glow.addColorStop(1,   'rgba(160,160,170,0.08)');
        ctx.fillStyle = glow;
        ctx.fillRect(barLeft, cy - barH / 2, barW, barH);
      });
      ctx.restore();
    } else {
      // Animate each row
      ctx.save();
      for (let i = 0; i < NUM_ROWS; i++) {
        const rowFrac = Z.dnaRows[i];
        if (rowFrac === undefined) continue;
        const cy = h * rowFrac;

        const rowStart = i * ROW_GAP;
        const local    = Math.max(0, Math.min((animPhase - rowStart) / ROW_DUR, 1));
        if (local <= 0) continue;

        // Phase A (0–0.60): chrome fill grows left → right
        const fillLocal = Math.min(local / 0.60, 1);
        const fillW     = barW * fillLocal;
        if (fillW > 0) {
          const fillGrad = ctx.createLinearGradient(barLeft, 0, barLeft + fillW, 0);
          fillGrad.addColorStop(0,    'rgba(140,140,152,0.22)');
          fillGrad.addColorStop(0.55, 'rgba(190,190,202,0.30)');  // ← fillAlpha
          fillGrad.addColorStop(0.85, 'rgba(228,228,238,0.40)');
          fillGrad.addColorStop(1,    'rgba(255,255,255,0.52)');   // ← fillAlpha tip
          ctx.fillStyle = fillGrad;
          ctx.fillRect(barLeft, cy - barH / 2, fillW, barH);
        }

        // Phase B (0.60–1.00): bright chrome shimmer sweeps left → right
        if (local > 0.60) {
          const shimLocal = (local - 0.60) / 0.40;
          const shimW     = barW * 0.28;
          const shimX     = barLeft - shimW + (barW + shimW) * shimLocal;
          const clipL     = Math.max(barLeft, shimX);
          const clipR     = Math.min(barRight, shimX + shimW);
          if (clipR > clipL) {
            const shimGrad = ctx.createLinearGradient(shimX, 0, shimX + shimW, 0);
            shimGrad.addColorStop(0,    'rgba(255,255,255,0)');
            shimGrad.addColorStop(0.42, 'rgba(255,255,255,0.55)'); // ← shimmerAlpha peak
            shimGrad.addColorStop(0.58, 'rgba(255,255,255,0.55)');
            shimGrad.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = shimGrad;
            ctx.fillRect(clipL, cy - barH / 2, clipR - clipL, barH);
          }
        }
      }
      ctx.restore();
    }
  }

  // ── 10. NFC_PANEL_CONTAINER frame — establishes the unlock box ──
  if (clbImgs.clbNfcPanel) ctx.drawImage(clbImgs.clbNfcPanel, 0, 0, w, h);

  // ── 10. NFC_ICON_SIGNAL + COMPONENT_UNLOCK_TITLE + baked icons ──
  // Draw after the panel so the baked content sits inside the visible box.
  if (clbImgs.clbNfcContent) ctx.drawImage(clbImgs.clbNfcContent, 0, 0, w, h);

  // ── 10. COMPONENT_COLLECTION_FOOTER nameplate ──
  if (clbImgs.clbFooter) ctx.drawImage(clbImgs.clbFooter, 0, 0, w, h);

  // ── 11. DATA_COLLECTION_NAME — inside footer plate ──
  {
    const rawName = card.teamName
      ? `${card.teamName.toUpperCase()}  COLLECTION`
      : 'FOUNDING COLLECTION';
    const colName  = `★  ${rawName}  ★`;  // ★ NAME ★
    const fontSize = Math.round(h * 0.019);
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `700 ${fontSize}px "Oswald", sans-serif`;
    ctx.fillStyle    = 'rgba(200,200,205,0.90)';
    ctx.fillText(colName, w * Z.footer.cx, h * Z.footer.cy);
    ctx.restore();
  }

  // ── DEBUG: translucent zone overlay (set DEBUG_CHROME_BACK_ZONES=true to enable) ──
  if (DEBUG_CHROME_BACK_ZONES) {
    const dbgZones = [
      { label: 'NAME',    y: h * (Z.name.cy - 0.055),                                              zh: h * 0.110, color: 'rgba(255,80,80,0.18)'  },
      { label: 'STORY',   y: h * Z.storyBody.top,                                                  zh: h * (Z.storyBody.bottom - Z.storyBody.top), color: 'rgba(80,255,80,0.18)'  },
      { label: 'DNA',     y: h * (Z.dnaRows[0] - 0.030),                                           zh: h * (Z.dnaRows[4] - Z.dnaRows[0] + 0.060), color: 'rgba(80,80,255,0.18)'  },
      { label: 'NFC',     y: h * (Z.nfcItems.rowFY[0] - 0.022),                                    zh: h * (Z.nfcItems.rowFY[2] - Z.nfcItems.rowFY[0] + 0.044), color: 'rgba(255,220,0,0.18)'  },
      { label: 'FOOTER',  y: h * (Z.footer.cy - 0.022),                                            zh: h * 0.044, color: 'rgba(255,80,255,0.18)' },
    ];
    dbgZones.forEach(({ label, y, zh, color }) => {
      ctx.save();
      ctx.fillStyle   = color;
      ctx.fillRect(0, y, w, zh);
      ctx.strokeStyle = color.replace('0.18', '0.75');
      ctx.lineWidth   = 1;
      ctx.strokeRect(0, y, w, zh);
      ctx.fillStyle   = 'rgba(255,255,255,0.95)';
      ctx.font        = 'bold 8px monospace';
      ctx.textAlign   = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 4, y + 2);
      ctx.restore();
    });
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function CardCanvas({ card, side, width = 300, height }: CardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerImgRef = useRef<HTMLImageElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const backPhotoImgRef = useRef<HTMLImageElement | null>(null);
  const futuristicImgsRef = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const futuristicLoadedRef = useRef(false);
  const galaxyHoloImgsRef = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const galaxyHoloLoadedRef = useRef(false);
  const galaxyHoloBackImgsRef = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const galaxyHoloBackLoadedRef = useRef(false);
  const chromeLegacyImgsRef = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const chromeLegacyLoadedRef = useRef(false);
  const chromeLegacyBackImgsRef = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const chromeLegacyBackLoadedRef = useRef(false);
  const chromeLegacyBackAnimRef = useRef<ChrBackAnimState>({ frameId: null, startTime: 0, phase: 0 });

  // Refs so draw() is stable and never needs to be recreated
  const cardRef = useRef(card);
  const sideRef = useRef(side);
  cardRef.current = card;
  sideRef.current = side;

  const displayH = height || width * (CARD_H / CARD_W);

  // Stable draw — reads card/side from refs, never recreated
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const card = cardRef.current;
    const side = sideRef.current;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = CARD_W * dpr;
    canvas.height = CARD_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    const style = card.template?.style || 'holo';

    if (side === 'front') {
      // Reset chrome-legacy back animation so it replays when switching back to Back view
      if (style === 'chrome-legacy') {
        const anim = chromeLegacyBackAnimRef.current;
        if (anim.frameId !== null) { cancelAnimationFrame(anim.frameId); anim.frameId = null; }
        anim.phase = 0;
      }
      if (style === 'galaxy-holo') {
        drawGalaxyHoloFront(ctx, card, CARD_W, CARD_H, playerImgRef.current, logoImgRef.current, galaxyHoloImgsRef.current);
      } else if (style === 'chrome-legacy') {
        drawChromeLegacyFront(ctx, card, CARD_W, CARD_H, playerImgRef.current, logoImgRef.current, chromeLegacyImgsRef.current);
      } else if (style === 'holo') {
        drawHoloFront(ctx, card, CARD_W, CARD_H, playerImgRef.current, logoImgRef.current);
      } else if (style === 'futuristic') {
        drawFuturisticFront(ctx, card, CARD_W, CARD_H, playerImgRef.current, logoImgRef.current, futuristicImgsRef.current);
      } else {
        drawChromeFront(ctx, card, CARD_W, CARD_H, playerImgRef.current, logoImgRef.current);
      }
    } else {
      if (style === 'galaxy-holo') {
        drawGalaxyHoloBack(ctx, card, CARD_W, CARD_H, galaxyHoloBackImgsRef.current);
      } else if (style === 'holo') {
        drawHoloBack(ctx, card, CARD_W, CARD_H, logoImgRef.current, backPhotoImgRef.current);
      } else if (style === 'futuristic') {
        drawFuturisticBack(ctx, card, CARD_W, CARD_H, logoImgRef.current, futuristicImgsRef.current);
      } else if (style === 'chrome-legacy') {
        const anim = chromeLegacyBackAnimRef.current;
        drawChromeLegacyBack(ctx, card, CARD_W, CARD_H, logoImgRef.current, chromeLegacyBackImgsRef.current, anim.phase);
        // Kick off the animation the first time (phase=0, no frame running)
        if (anim.frameId === null && anim.phase < 1) {
          runChromeBackAnim(chromeLegacyBackAnimRef, draw);
        }
      } else {
        drawChromeBack(ctx, card, CARD_W, CARD_H, logoImgRef.current, backPhotoImgRef.current);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Futuristic assets — load once when template style becomes futuristic
  useEffect(() => {
    if (card.template?.style !== 'futuristic') return;
    if (futuristicLoadedRef.current) { draw(); return; }
    const paths: Record<string, string> = {
      background:   '/templates/futuristic/background.png',
      frame:        '/templates/futuristic/frame.png',
      badge:        '/templates/futuristic/badge.png',
      statPanel:    '/templates/futuristic/stat-panel.png',
      nfcIcon:      '/templates/futuristic/nfc-icon.png',
      nameplate:    '/templates/futuristic/nameplate.png',
      topBanner:    '/templates/futuristic/top-banner.png',
      backBg:       '/templates/futuristic-back/background.png',
      backFrame:    '/templates/futuristic-back/frame.png',
      backStatBoxes:'/templates/futuristic-back/stat-boxes-empty.png',
      backPhysStats:'/templates/futuristic-back/physical-stats.png',
      backFooter:   '/templates/futuristic-back/footer-plate.png',
    };
    let remaining = Object.keys(paths).length;
    Object.entries(paths).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => {
        futuristicImgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { futuristicLoadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) draw(); };
      img.src = src;
    });
  }, [card.template?.style, draw]);

  // Galaxy Holo assets — load all 6 layers once when template style becomes galaxy-holo
  useEffect(() => {
    if (card.template?.style !== 'galaxy-holo') return;
    if (galaxyHoloLoadedRef.current) { draw(); return; }
    const paths: Record<string, string> = {
      ghBase:      '/templates/galaxy-holo/base.png',
      ghFrame:     '/templates/galaxy-holo/02_frame.png',
      ghHeader:    '/templates/galaxy-holo/03_header.png',
      ghBottomUI:  '/templates/galaxy-holo/04_bottom_ui.png',
      ghStatBoxes: '/templates/galaxy-holo/05_stat_boxes.png',
      ghNfc:       '/templates/galaxy-holo/07_nfc_icon.png',
    };
    let remaining = Object.keys(paths).length;
    Object.entries(paths).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => {
        galaxyHoloImgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { galaxyHoloLoadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) draw(); };
      img.src = src;
    });
  }, [card.template?.style, draw]);

  // Galaxy Holo back assets — load once when template style becomes galaxy-holo
  useEffect(() => {
    if (card.template?.style !== 'galaxy-holo') return;
    if (galaxyHoloBackLoadedRef.current) { draw(); return; }
    let remaining = GHB_LAYERS.length;
    GHB_LAYERS.forEach(({ key, src }) => {
      const img = new Image();
      img.onload = () => {
        galaxyHoloBackImgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { galaxyHoloBackLoadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) draw(); };
      img.src = src;
    });
  }, [card.template?.style, draw]);

  // Chrome Legacy assets — load once when template style becomes chrome-legacy
  useEffect(() => {
    if (card.template?.style !== 'chrome-legacy') return;
    if (chromeLegacyLoadedRef.current) { draw(); return; }
    const paths: Record<string, string> = {
      chlBg:          '/templates/chrome-legacy/chrome-legacy-bg-stadium.png',
      chlMetal:       '/templates/chrome-legacy/chrome-legacy-metal-texture.png',
      chlFrame:       '/templates/chrome-legacy/chrome-legacy-frame.png',
      chlTopBadge:    '/templates/chrome-legacy/chrome-legacy-top-badge.png',
      chlSideTab:     '/templates/chrome-legacy/chrome-legacy-side-tab.png',
      chlStatBox:     '/templates/chrome-legacy/chrome-legacy-stat-box-frame.png',
      chlBottomPlate: '/templates/chrome-legacy/chrome-legacy-bottom-plate.png',
      chlNfcTab:      '/templates/chrome-legacy/chrome-legacy-nfc-tab.png',
      chlLogoOverlay: '/templates/chrome-legacy/chrome-legacy-logo-overlay.png',
      chlNameplate:   '/templates/chrome-legacy/chrome-legacy-nameplate-overlay.png',
    };
    let remaining = Object.keys(paths).length;
    Object.entries(paths).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => {
        chromeLegacyImgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { chromeLegacyLoadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) draw(); };
      img.src = src;
    });
  }, [card.template?.style, draw]);

  // Chrome Legacy back assets — canonical 13-layer set from public/templates/chrome-legacy/back/
  // Loads once per template mount; onerror gracefully skips missing layers so draw always fires.
  useEffect(() => {
    if (card.template?.style !== 'chrome-legacy') return;
    if (chromeLegacyBackLoadedRef.current) { draw(); return; }
    const paths: Record<string, string> = {
      clbBase:        '/templates/chrome-legacy/back/chrome-legacy-back-base.png',         // FRAME_CHROME_OUTER_BORDER + dark bg   (Untitled design 15)
      clbNameplate:   '/templates/chrome-legacy/back/chrome-legacy-back-nameplate.png',    // section divider lines                  (Untitled design 16)
      clbDnaRow1:     '/templates/chrome-legacy/back/chrome-legacy-back-dna-row-1.png',    // LEADERSHIP icon + score bars           (51.png)
      clbDnaRow2:     '/templates/chrome-legacy/back/chrome-legacy-back-dna-row-2.png',    // WORK ETHIC icon + score bars           (52.png)
      clbDnaRow3:     '/templates/chrome-legacy/back/chrome-legacy-back-dna-row-3.png',    // COACHABILITY icon + 4/5 bars           (53.png)
      clbDnaRow4:     '/templates/chrome-legacy/back/chrome-legacy-back-dna-row-4.png',    // COMPETITIVE DRIVE icon + score bars    (54.png)
      clbDnaRow5:     '/templates/chrome-legacy/back/chrome-legacy-back-dna-row-5.png',    // TEAM FIRST icon + score bars           (55.png)
      clbNfcPanel:    '/templates/chrome-legacy/back/chrome-legacy-back-nfc-panel.png',    // NFC_PANEL_CONTAINER frame              (Untitled design 18)
      clbNfcContent:  '/templates/chrome-legacy/back/chrome-legacy-back-nfc-content.png',  // TAP TO UNLOCK + NFC signal + icons    (Untitled design 23)
      clbFooter:      '/templates/chrome-legacy/back/chrome-legacy-back-footer.png',       // footer angular nameplate               (Untitled design 19)
    };
    let remaining = Object.keys(paths).length;
    Object.entries(paths).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => {
        chromeLegacyBackImgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { chromeLegacyBackLoadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) { chromeLegacyBackLoadedRef.current = true; draw(); } };
      img.src = src;
    });
  }, [card.template?.style, draw]);

  // Player photo — decode only when the URL changes, not on every card update
  useEffect(() => {
    if (!card.playerPhoto) { playerImgRef.current = null; draw(); return; }
    const img = new Image();
    img.onload = () => { playerImgRef.current = img; draw(); };
    img.src = card.playerPhoto;
  }, [card.playerPhoto, draw]);

  // Team logo — decode only when the URL changes
  useEffect(() => {
    if (!card.teamLogo) { logoImgRef.current = null; draw(); return; }
    const img = new Image();
    img.onload = () => { logoImgRef.current = img; draw(); };
    img.src = card.teamLogo;
  }, [card.teamLogo, draw]);

  // Back photo — decode only when the URL changes
  useEffect(() => {
    if (!card.backPhoto) { backPhotoImgRef.current = null; draw(); return; }
    const img = new Image();
    img.onload = () => { backPhotoImgRef.current = img; draw(); };
    img.src = card.backPhoto;
  }, [card.backPhoto, draw]);

  // Redraw on text/settings/side changes — no image decoding, just canvas repaint
  useEffect(() => {
    draw();
  }, [
    draw, side,
    card.playerName, card.teamName, card.jerseyNumber, card.position,
    card.accentColor, card.secondaryColor, card.showStats, card.stats,
    card.backText, card.height, card.age, card.classYear, card.hometown,
    card.photoOffsetX, card.photoOffsetY, card.photoScale,
    card.backPhotoOffsetX, card.backPhotoOffsetY, card.backPhotoScale,
    card.template?.id,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height: displayH }}
      className="rounded shadow-sm"
    />
  );
}
