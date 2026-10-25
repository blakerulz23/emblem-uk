# UK partner programme: how it works and how to run it

Lean first version (branch `feat/uk-partner-programme`, migration `0095`). Same terms as the Canadian programme, run separately for the UK site.

## What creators and customers see
| Page | What it does |
|---|---|
| `/partners/apply` | Public application. Requires 18+, UK-based and terms accepted (version `uk-2026-10`). Rate-limited. A repeat application from the same email is a silent no-op |
| `/partners` | The creator's dashboard after a one-time-code sign-in with the email they applied with. Shows their code, link and an "Ad"-first caption, plus earnings (ready / on hold / paid) and orders as **date and amounts only**, never who bought |
| `/p/CODE` | The link creators share. It sets **no cookie** and stores nothing: it shows the code and a "Start your card" button. Unknown or switched-off codes show the page without a discount |
| `/staff/partners` | Staff: approve or reject, rates, record codes, pause, notes, payouts. Linked from the staff queue |

## How an order gets credited
1. A staff member approves the creator, then creates the code **in Shopify Admin first** (below), then records it at `/staff/partners`.
2. The customer types the code at Shopify checkout. Shopify takes the discount off.
3. `orders/paid` reads the order's single discount code. If it's a recorded UK partner code, the payment check accepts **exactly that percentage off** (±1p rounding) and nothing else. The order is recorded as paid at the discounted amount.
4. `record_uk_partner_commission` writes one commission per order (unique, so a retried webhook can't credit twice): commission % × what was paid for cards, held for 45 days. Own orders (the declaring adult's email matches the partner's) and paused partners or switched-off codes get a void row instead.
5. A refund that returns money for a card, or a cancellation, voids a pending commission. At payout time, only commissions whose hold has passed **and whose order is still paid** count.
6. Monthly: on `/staff/partners`, "Create payout" locks and gathers everything payable (refused under £40). Send the bank transfer yourself, then "Mark sent" with the reference. Bank details are never stored in Emblem; ask the creator by email.

**Not covered:** Squad Invite orders never accept a partner discount. Their price is set by the squad tier and still verified exactly. Any other discount on a UK order still fails closed with a staff alert, as before.

## Creating a code in Shopify Admin (each time)
Same store as Canada (`officialgudzzz`), so **codes share one namespace**: a UK code can't reuse a Canadian code's name.
1. Discounts → Create discount → **Amount off products** → Discount code: the creator's code (3–20 letters or digits).
2. Value: **percentage = the creator's customer discount** shown on `/staff/partners` (default 20%). **It must match exactly**, or orders using it can't be marked paid (staff get a `discount_mismatch` alert).
3. Applies to: **specific products → only the UK card variant** (`NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT`). Not the Squad Invite variants.
4. Combinations: **none** (not with product, order or shipping discounts).
5. No end date, no minimum, no usage limit, open to all customers.
6. Save, then record the same code on `/staff/partners`.

To switch a code off: "Switch off" on `/staff/partners` **and** deactivate it in Shopify.

## ⚠️ Check before going live: Canadian codes
Canada's codes are created by `emblem-ca` with `SHOPIFY_PARTNER_DISCOUNT_VARIANT_IDS`, which its own comment describes as "every market's card variants (CA, US, UK)". **If that list includes the UK card variant, a Canadian code typed on a UK order takes 20% off**. The UK site then can't verify it, so the order stays unpaid with a `discount_mismatch` alert. That is the same as today, not caused by this change. Ask Matt to confirm the list, and either remove the UK variant or agree how UK orders using Canadian codes should be credited.

## Release order
1. Merge after review. The migration is **0095**: it touches no existing table, policy or function, so it can be applied before or after the relationship-authorization lockdown (0088–0091).
2. Apply `0095_uk_partner_programme.sql` to production (Supabase SQL editor or CLI), then deploy the app. An app deployed without the migration would return 500 to Shopify (which then retries) on every order carrying a discount code, every card refund and every cancellation, so **migration first**.
3. Update the **Privacy Policy** to cover partner applicants' data (name, email, profile link, audience note; purpose: running the programme; retention). The apply form links to it.
4. Make a test code (e.g. `UKTEST`, 20%, UK card variant), run one real £24.99 purchase with it, and check:
   - the order is marked paid at £19.99;
   - a commission row of £3.99 appears on `/staff/partners`;
   - then refund it in Shopify and check the commission is voided.

## Tests
- `npx vitest run src/lib/partner-programme.test.ts src/app/api/webhooks/shopify` covers the payment check and webhook crediting.
- `node supabase/tests/0095_uk_partner_programme_pglite_test.mjs` runs every migration on real Postgres (pglite, `npm install --no-save @electric-sql/pglite`). It covers privileges, crediting, idempotency, voids, own orders and payouts.
- `node supabase/tests/0095_uk_partner_payout_concurrency_test.mjs` runs every migration on a throwaway multi-connection PostgreSQL 17 server (`npm install --no-save embedded-postgres@17.10.0-beta.17 pg`). It forces each interleaving of payout against void, payout against an in-flight refund, and two payouts at once, then runs a 25-round free-running stress. It also checks that the database refuses any payout whose amount differs from its linked commissions.

## Concurrency (how payouts stay consistent)
Payouts and voids for one partner are serialised on the partner's row. Every function takes locks in the same order: partner, then commissions, then orders. A payout locks one fixed set of eligible commissions and their orders, and attaches exactly that set. A deferred constraint trigger checks at commit that every payout equals the sum of its linked commissions.
- **Refund arrives before allocation:** its commission is voided, and the payout never includes it.
- **Refund arrives after allocation:** the commission stays in the payout as paid, and staff reconcile it by hand.
