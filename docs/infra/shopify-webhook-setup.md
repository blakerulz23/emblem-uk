# Shopify webhook — production setup runbook

Companion to `src/app/api/webhooks/shopify/orders-paid/route.ts` and the
full plan doc (`shopify-webhook-plan.md` on Matt's local drive). Follow
this end to end once and the webhook is live.

## Prerequisites

- Shopify Admin access to `officialgudzzz.myshopify.com`
- "Allow custom app development" enabled on the store (Settings → Apps
  and sales channels → Develop apps → Allow custom app development)
- Vercel env-var write access on the `emblem-uk` project

## Steps

### 1. Create the Custom App

Shopify Admin → Settings → Apps and sales channels → Develop apps →
**Create an app**.

- Name: `Emblem OS Webhook`
- App developer: Matt

Once created, click **Configure Admin API scopes** and grant only:
- `read_orders` — needed for future reconciliation queries against
  Shopify's Admin API. Not required by the webhook handler itself,
  which reads from the webhook payload only.

Do NOT grant `write_orders` — the webhook writes only to our own DB.

Click **Save**, then **Install app**. Save the Admin API access token
in 1Password even though the webhook doesn't use it.

### 2. Register the `orders/paid` webhook

Shopify Admin → Settings → Notifications → scroll to **Webhooks** →
**Create webhook**.

- Event: `Order paid`
- Format: `JSON`
- URL: `https://emblem-uk.vercel.app/api/webhooks/shopify/orders-paid`
- Webhook API version: latest stable
- Save

Shopify shows the **signature secret** for the webhook on the
confirmation screen. Copy it now — you won't see it again.

### 3. Set Vercel env vars

Vercel project `emblem-uk` → Settings → Environment Variables. Add
both scopes (Production + Preview):

- `SHOPIFY_WEBHOOK_SECRET` — the value from step 2. **Mark as Sensitive.**
- `SHOPIFY_STORE_DOMAIN` — `officialgudzzz.myshopify.com`

Redeploy so the values are picked up.

### 4. Verify the endpoint is live

Once redeployed, in your browser hit:

    https://emblem-uk.vercel.app/api/webhooks/shopify/orders-paid

You should get a small JSON response describing the endpoint (from the
GET handler). 404 = deploy didn't include the route; check the build
log.

### 5. Test with a real order

Best done against a Shopify test order — use the `bogus` gateway
(fixed test-mode card number 1) to complete checkout without a real
charge.

- Complete a builder flow on emblem-uk.vercel.app/builder
- Complete Shopify checkout with test-mode payment
- `/staff/queue`: the order should reach `payment_status = paid` within
  a minute
- Vercel runtime logs: `POST /api/webhooks/shopify/orders-paid` returns 200
- If the order sits at `order_intent`: either HMAC failed (check
  Shopify's webhook delivery log) or Order Ref didn't survive to
  `note_attributes` (check the order in Shopify Admin)

### 6. Rollout — leave manual approve in place for 7 days

The existing `/staff/queue → Approve` button stays live. Whichever
fires first wins — the handler is idempotent. Watch runtime logs for
7 days, then decide whether to hide the manual button.

## Troubleshooting

**401 "invalid signature"** — `SHOPIFY_WEBHOOK_SECRET` doesn't match
what Shopify is signing with. Delete and re-add the Vercel env var
(trailing-whitespace is the usual culprit), or you regenerated the
secret in Shopify without updating Vercel.

**200 "no order_ref, ignored"** — Shopify order didn't come from our
builder (e.g. manually created in Admin). Expected, not an error.

**200 "no matching order"** — race with `/api/orders/intent` or a
real bug. Manual approve on `/staff/queue` still works either way.
Check the order intent logs around the same timestamp.

## Secret rotation

1. Shopify Admin → the webhook → **Regenerate secret**
2. Copy → Vercel env var → Save → Redeploy
3. Between step 1 and step 3 any delivery will 401 and Shopify will
   retry with backoff — briefly outage-adjacent, do it outside high-
   traffic windows
