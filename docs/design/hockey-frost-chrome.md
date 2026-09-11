# Hockey Sport Pack 01 - Frost Chrome

## Purpose

Frost Chrome is the first hockey-native Emblem card design direction. It should not feel like a
football template recolored for Canada. The visual language is based on rink glass, cold chrome,
ice spray, skate-cut motion, dark arena contrast, and a large sweater-number hierarchy.

## MVP Scope

- Hidden/dev-only preview first.
- Trading cards only.
- Custom Collection only.
- No licensed club marks.
- Sharing disabled until rights and consent are reviewed.

## Sport Contract

- sport: `hockey`
- positions: `G`, `D`, `C`, `LW`, `RW`
- front stats: `GP`, `G`, `A`
- back stats: `GP`, `G`, `A`, `PTS`

## Implementation Notes

This first pass adds a standalone React renderer and a hidden preview page:

- `src/components/emblem-uk/hockey/FrostChromeHockeyCard.tsx`
- `src/components/emblem-uk/hockey/FrostChromeHockeyCard.module.css`
- `src/lib/hockey-frost-chrome-pack.ts`
- `src/app/dev/hockey-frost-chrome/page.tsx`

The next production pass should either:

1. convert the CSS frame into separate PNG template layers and call it from `CardArt`, or
2. wrap this component from `CardFace` for `templateId === 'hockey-frost-chrome'`.

The preferred end state remains the existing Emblem architecture:

`Card Definition -> CardFace -> CardArt`

## Stress Tests Before Release

- white jersey on ice
- dark jersey on boards
- cage/helmet photo
- goalie photo
- long surname
- single-digit and three-digit sweater numbers
- missing badge
- poor phone photo
- front/back print capture at the same size as production

