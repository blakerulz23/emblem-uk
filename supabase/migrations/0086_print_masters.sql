-- Emblem UK — immutable full-bleed print masters
--
-- NOT APPLIED anywhere (local POC branch only — see
-- local-print-poc/PRINT_MASTER_REPORT.md for the full writeup). This is a
-- new, dedicated asset type: a genuine full-bleed (2.75x3.75in, 826x1126px
-- @300dpi) PNG per side, generated once by the server-side compositor
-- (src/lib/print-master-render.ts) at guardian-confirmation time, never
-- built by mirroring/blurring an already-finished trim image the way the
-- legacy buildFullBleedRaster() (pdf-generator.ts) does.
--
-- Deliberately its OWN table, not an extra column on orders.print_files:
-- print_files is a jsonb array keyed by playerId holding a FINISHED PDF's
-- S3 key (migration 0007) — a print master is an earlier-stage, richer
-- object (two keys, two digests, dimensions, a render/template version,
-- an immutability lifecycle) that doesn't fit that shape, and orders rows
-- do not exist yet at the point a master is generated (masters are scoped
-- by submission_id, the same pre-order capability id print-files/<key>/
-- already uses — see builder-submission-capability.ts). order_id is
-- attached (nullable) once the order is actually persisted.
--
-- Rollback: `drop table if exists public.print_masters;` — this migration
-- touches nothing else (no other table/column is altered), so rollback is
-- a single clean drop with no cascade risk to orders/print_files/anything
-- else.
--
-- Recovery: because S3 keys are content-addressed by a stored sha256 and
-- are themselves immutable once written, a lost/corrupted row can always
-- be reconstructed by re-deriving it from the two known-good S3 objects
-- (front_key/back_key) for that submission_id/player_id/product, without
-- ever needing to regenerate the artwork itself.

create table public.print_masters (
  id uuid primary key default gen_random_uuid(),

  -- Pre-order scope: the same builder-submission capability id that
  -- print-files/<submissionId>/... already uses (builder-submission-
  -- capability.ts). order_id is filled in later, once order persistence
  -- (order-enquiry-validation.ts) creates the real orders row.
  submission_id uuid not null,
  order_id uuid references public.orders (id),
  player_id text not null,
  product text not null,

  front_key text not null,
  back_key text not null,

  -- Authoritative 300dpi full-bleed dimensions (print-specs.ts:
  -- pixelDimensions({finalWidthIn:2.5, finalHeightIn:3.5, bleedIn:0.125,
  -- dpi:300}) => 826x1126). Hardcoded as a CHECK, not just validated in
  -- application code, so no row can ever claim to be a verified master at
  -- the wrong size.
  width_px integer not null,
  height_px integer not null,

  mime_type text not null default 'image/png',
  front_sha256 text not null,
  back_sha256 text not null,

  -- Identifies which compositor/asset-manifest version produced this
  -- master (e.g. 'custom-collection-v1') — lets a future template/asset
  -- change be told apart from what an already-confirmed order actually
  -- printed, without needing to inspect the pixels themselves.
  render_version text not null,

  -- 'confirmed' is the immutable, approved artwork a real order prints
  -- from. 'superseded' marks a row staff deliberately replaced (see
  -- superseded_by) — the original row is kept forever, never deleted or
  -- edited in place, so a historical order's provenance is always
  -- inspectable.
  status text not null default 'confirmed' check (status in ('confirmed', 'superseded')),

  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.print_masters (id),

  constraint print_masters_dims_check check (width_px = 826 and height_px = 1126),
  constraint print_masters_mime_check check (mime_type = 'image/png'),
  constraint print_masters_product_check check (product in ('card')),
  constraint print_masters_sha_format check (
    front_sha256 ~ '^[0-9a-f]{64}$' and back_sha256 ~ '^[0-9a-f]{64}$'
  ),
  -- Every key must live under this table's own namespace, scoped to the
  -- row's own submission/product — never a bare prefix, and never able to
  -- reference another submission's object (mirrors order-enquiry-
  -- validation.ts's isValidNamespacedKey discipline, enforced again here
  -- at the schema level as defence in depth).
  constraint print_masters_front_key_namespace check (
    front_key like ('print-masters/' || submission_id::text || '/' || product || '/%-front.png')
  ),
  constraint print_masters_back_key_namespace check (
    back_key like ('print-masters/' || submission_id::text || '/' || product || '/%-back.png')
  ),
  constraint print_masters_superseded_fields check (
    (status = 'confirmed' and superseded_at is null and superseded_by is null)
    or (status = 'superseded' and superseded_at is not null)
  )
);

-- Idempotency + immutability: at most one CONFIRMED master per
-- (submission, player, product) at a time. A retried confirm request
-- finds this row and reuses it rather than creating a conflicting
-- duplicate; a deliberate staff regeneration must first supersede the
-- existing row (status='superseded') before a new confirmed row for the
-- same key can be inserted — the constraint makes "silently replace an
-- approved master" structurally impossible, not just discouraged.
create unique index print_masters_one_confirmed_idx
  on public.print_masters (submission_id, player_id, product)
  where status = 'confirmed';

create index print_masters_order_id_idx on public.print_masters (order_id) where order_id is not null;

alter table public.print_masters enable row level security;
revoke all on public.print_masters from public, anon, authenticated, service_role;
grant select, insert, update on public.print_masters to service_role;
