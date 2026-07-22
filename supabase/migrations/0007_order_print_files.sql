-- Emblem UK — print files attached to orders
--
-- The builder now captures each approved card (front + back) at submit
-- time, renders a print-ready PDF via /api/render-print, and stores the
-- S3 keys here so staff always have the production files for a paid
-- order. Keys, not URLs — presigned URLs expire (SigV4 max 7 days);
-- /staff/queue re-signs from the key on every page load.
--
-- Shape: [{ "playerId": "...", "playerName": "...", "key": "print-files/..." }]

alter table orders add column print_files jsonb;
