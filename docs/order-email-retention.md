# Order emails: purpose, access and retention

Decisions (Blake, 14 November 2026):
- **The buyer's address is kept with the order.** Deleting the buyer's Emblem account doesn't change it.
- **A named guardian's address goes when that guardian's account is erased.** Migration 0097, section 12.

Migration 0097's account erasure never changes a buyer's address. Apart from section 12, the only order field it touches is `approved_by`, which is cleared when the approving staff account is erased, as before 0097.

## What this covers
- `orders.purchaser_email`: the address the buyer gave at checkout. Kept, as below.
- `builder_order_authority_declarations.adult_email`: the buyer's verified address on a gift order's permission step. Kept the same way.
- `orders.intended_guardian_email`, and `builder_guardian_approval_requests.guardian_email` on gift orders: the address of the child's parent or guardian, named by the buyer. Kept with the order on the same terms, **until that guardian's own account is erased**. See "When a named guardian deletes their account".

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

## When a named guardian deletes their account
At the final erasure (0097, section 12, in the same transaction), wherever the order names the erased account's address:
- `orders.intended_guardian_email` is cleared. `intended_guardian_erased_at` records, permanently, that a named guardian was erased, so the profile invite never falls back to the buyer.
- `builder_guardian_approval_requests.guardian_email` is cleared. The approval evidence stays, without the address:
  - the request, its status and times, its token hash and declaration version;
  - `guardian_email_redacted_at`;
  - `guardian_distinct_from_buyer`: whether the approving address was different from the buyer's (purchaser and declaring adults), worked out before the address goes.
- A pending approval request is revoked, so its emailed link no longer works.
- **Holds:** every affected order that isn't finished is held (`held_at`, `held_reason` `named_guardian_account_erased`).
  - Not finished means payment status `order_intent`, `pending_payment` or `paid`, and not `guardian_declined`.
  - The database refuses to approve or fulfil a held order, for every role. Payments still apply.
  - The staff queue shows "Held" and no approve button.
  - Staff release a hold only after confirming a guardian: clear `held_at` and `held_reason` together. Until a guardian address is recorded again, no profile invite is sent.
- Nothing changes on an order because its buyer erased their account, unless the guardian's address is the same address.
- An account whose deletion is under staff review changes nothing until staff complete the deletion.

## When the purchaser deletes their account
- The order and the buyer's emails stay as they are (a guardian address that is the same address goes, as above).
- Invites the order created that were addressed to that account are revoked at erasure, and lose the address (0097, section 10).
- A later invite or resend for the order goes only by a deliberate staff action.
- Automatic order notifications still go to the address on the order. For example, the buyer is told when a guardian responds to a gift order (`/api/builder-authority/guardian-respond`).

## Follow-up (recorded 14 November 2026, not built)
Order history is reached by email alone: the `orders: purchaser can view their own` policy matches `purchaser_email = auth.email()`. Anyone who later holds an account with that address sees every past order on it.
- **Follow-up:** replace that with account-bound access, or access after an extra recovery check.
  - Account-bound: orders linked to the buying account when placed or first claimed.
  - Recovery check: a deliberate, verified recovery step before past orders show.
- The access rule above stays until that change is designed, reviewed and released separately.
