# Order purchaser emails: purpose, access and retention

Decision (Blake, 14 November 2026): an order's purchaser email is kept with the order. Deleting the purchaser's Emblem account doesn't change it. Migration 0097's account erasure never changes an order's emails. The only order field it touches is `approved_by`, which is cleared when the approving staff account is erased, as before 0097.

## What this covers
- `orders.purchaser_email`: the address the buyer gave at checkout.
- `orders.intended_guardian_email`: the address the buyer named for the child's parent, when they gave one. It is held on the same order record and treated the same way. Open decision: confirm this rule for it.

## Purpose
- **Financial:** the order is part of the company's accounting records (payments, refunds and partner commissions are worked out from it).
- **Contractual:** it is the contact for the contract of sale: delivery, faults, refunds and complaints.
- **Audit:** it shows who bought what, and when. That is needed for disputes, chargebacks and partner-commission checks (partner commissions are tied to orders: see `docs/partner-data-retention.md`).

It isn't used for marketing, and it isn't proof that the buyer is the child's parent or guardian (`0003`: an order is never itself proof of a real player or a guardian).

## Who can read it
- **The server,** with the app's `service_role` key (server-side only). That covers:
  - the staff pages, which check for a staff session first;
  - the order flows themselves: checkout, payment webhooks and updates, unpaid-order and duplicate-payment recovery, the purchaser's own order recovery, and the invites and notifications an order sends.
- **The purchaser,** through the app: the `orders: purchaser can view their own` RLS policy matches `purchaser_email = auth.email()`.
  - It is an exact match on the signed-in account's address. The policy itself doesn't check that the address is verified: sign-up and sign-in do that.
  - A later account with the same address can see those orders, including after the original account was deleted. This is deliberate: the address is what ties a buyer to the order, not the account.
- **Nobody else.** Anonymous users have no access, and other signed-in users see no order that isn't theirs.

Don't copy order emails into logs, alerts, analytics, or any table or record that isn't the order.

## How long it is kept
- **6 years from the end of the financial year the order falls in,** or longer if the law requires (the same period as the partner accounting records).
- The financial year ends on **30 November**. Check the year-end on the Companies House register before any clean-up; `docs/partner-data-retention.md` shows how.
- **Legal holds:** if there is a dispute, chargeback, HMRC enquiry or other reason to keep an order, don't remove anything until the hold ends.
- **After the period:** the purchaser and intended-guardian emails are anonymised by a reviewed, manual clean-up signed off by Blake. The order's amounts and dates stay for as long as the accounts need them.
  - Nothing removes them automatically, and no app route may delete or rewrite orders for retention.
  - The clean-up procedure isn't written yet: write it before the first orders reach the end of their period.

## When the purchaser deletes their account
- The order and its emails stay as they are.
- Invites the order created that were addressed to that account are revoked at erasure, and lose the address (0097, section 10).
- A later invite or resend for the order goes only by a deliberate staff action.
- Automatic order notifications still go to the address on the order. For example, the buyer is told when a guardian responds to a gift order (`/api/builder-authority/guardian-respond`).
