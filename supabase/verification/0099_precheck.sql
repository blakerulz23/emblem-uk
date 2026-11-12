-- 0099 PRE-CHECK. Read-only: one SELECT, one row of counts and booleans.
-- Never returns an order, person, email or child. Run in the target
-- project's SQL editor immediately before applying
-- 0099_gift_checkout_requires_guardian_approval.sql.
--
-- STOP (do not apply) unless:
--   guard_not_applied, guard_begin_is_0080 and guard_apply_is_0080 are all true;
--   blocked_approved_open = 0 (otherwise a buyer is mid-way to paying for a
--     self-approved or approval-missing gift order: review with Blake first);
--   blocked_paid matches the R5 cases already held by staff (expected 0).
-- Record every value; the post-check must reproduce the blocked_* counts.
--
-- "blocked" is 0099's rule, written out inline here (the helper does not
-- exist yet): a gift order is blocked unless it is guardian_approved and its
-- latest 'approved' request came from an address that is neither the
-- purchaser's nor any declaring adult's (trimmed of all leading/trailing
-- whitespace as JavaScript trim() does, lower-cased).
--
-- Before applying, confirm the app release with the 0099 route changes is
-- already live in production (deploy order: app first, then 0099).
with gift as (
  select o.id, o.authority_status, o.payment_status,
    (select lower(regexp_replace(r.guardian_email, '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) from public.builder_guardian_approval_requests r
      where r.order_id = o.id and r.status = 'approved'
      order by r.responded_at desc nulls first, r.created_at desc limit 1) as approver,
    lower(regexp_replace(coalesce(o.purchaser_email, ''), '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) as purchaser
  from public.orders o
  where o.authority_status in ('guardian_approval_pending', 'guardian_approved', 'guardian_declined')
),
classified as (
  select g.*,
    case
      when g.authority_status <> 'guardian_approved' then 'gift_not_approved'
      when g.approver is null or g.approver = '' then 'gift_approval_missing'
      when g.approver = g.purchaser then 'gift_self_approved'
      when exists (select 1 from public.builder_order_authority_declarations d
                   where d.order_id = g.id and lower(regexp_replace(d.adult_email, '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')) = g.approver) then 'gift_self_approved'
      else null
    end as block_reason
  from gift g
)
select
  to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is null as guard_not_applied,
  coalesce((select p.prosecdef and p.prosrc like '%authority_not_confirmed%' and p.prosrc not like '%gift_approval%'
            from pg_proc p where p.oid = to_regprocedure('public.begin_gate3_checkout(uuid)')), false) as guard_begin_is_0080,
  coalesce((select p.prosecdef and p.prosrc like '%duplicate_event%' and p.prosrc not like '%gift_approval%'
            from pg_proc p where p.oid = to_regprocedure('public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)')), false) as guard_apply_is_0080,
  (select count(*) from classified) as gift_orders,
  (select count(*) from classified where authority_status = 'guardian_approved') as gift_approved,
  (select count(*) from classified where authority_status = 'guardian_approved' and block_reason is null) as gift_genuine,
  (select count(*) from classified where block_reason = 'gift_self_approved') as gift_self_approved,
  (select count(*) from classified where block_reason = 'gift_approval_missing') as gift_approval_missing,
  (select count(*) from classified where block_reason = 'gift_not_approved') as gift_not_approved,
  -- Newly refused at checkout by 0099 (approved status, but not genuinely).
  (select count(*) from classified where block_reason in ('gift_self_approved', 'gift_approval_missing')
     and payment_status in ('order_intent', 'pending_payment')) as blocked_approved_open,
  -- Pending/declined and unpaid: checkout already refused them; 0099 also refuses their payment.
  (select count(*) from classified where block_reason = 'gift_not_approved'
     and payment_status in ('order_intent', 'pending_payment')) as blocked_not_approved_open,
  -- Already paid: 0099 does not change these. They are R5 cases staff must hold.
  (select count(*) from classified where block_reason is not null and payment_status in ('paid', 'fulfilled')) as blocked_paid,
  (select count(*) from classified where block_reason is not null) as blocked_total,
  -- Context only: unpaid non-gift orders, which 0099 leaves unaffected.
  (select count(*) from public.orders o where (o.authority_status is null or o.authority_status = 'confirmed')
     and o.payment_status in ('order_intent', 'pending_payment')) as non_gift_open;
