# Emblem UK

Landing page for Emblem, a UK-first junior football and rugby player card product.

Brand positioning: Emblem preserves the grassroots player journey. The card, profile,
stats, photos and highlights are all ways of helping families, clubs and players
play the season, remember the journey and belong forever.

## Local preview

```bash
npm.cmd run dev
```

Then open `http://localhost:3000`.

## Builder bridge

The static builder keeps all work in the browser and can export an approved-order JSON manifest. That manifest is the handoff shape for the future production integration with the `youthcards` card engine: each approved player becomes one `CardArt` render payload, then the production app can generate print PDFs and checkout/order records.

The current UK-first sport data is football and rugby. Photos in the exported manifest are browser data URLs for the prototype; production should upload them and replace those values with stable asset URLs.

Template 001 is `EMJFL Orange`, built from the previous `emjf footy card` artwork. Its project-owned assets live in `public/templates/emjfl-orange/` so the static builder can preview the real UK football card style before the production `CardArt` migration.

The EMJFL template uses `base.png`, `default-player-clean.png`, and `footer-swoosh.png` as active layers. The `name-placement.png`, `position-placement.png`, and `kit-number-placement.png` files are retained as placement references for the dynamic CSS text and number positions.

## Deploy

This project is static and can be deployed directly to Vercel from GitHub.
