# Emblem UK

Emblem UK is a Next.js app for grassroots football and rugby player cards.

The homepage positions Emblem around the UK grassroots player journey:

- football first, rugby next
- premium printed player cards
- interactive digital profiles with stats, photos, highlights and memories
- single-player, sibling/friend and team-order flows

## Builder

The real builder has been migrated from the local Youthcards app into this project. The app route is:

```text
/builder?product=cards
```

The migrated builder includes the React/Next flow, template gallery, edit screens, review screens and the real EMJFL template implementation.

The EMJFL template assets live in:

```text
public/templates/emjfl/
```

That includes the front frame, back frame, league badge, corner ribbon and club badge picker assets used by `CardArt.tsx`.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For this Codex session the dev server was started on `http://localhost:3002` to avoid the older static preview running on port `3001`.

## Build

```bash
npm run build
```

Vercel is configured as a Next.js deployment through `vercel.json`.
