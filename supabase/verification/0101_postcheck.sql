-- 0101 POST-CHECK. Read-only: one SELECT, one row of counts and booleans.
-- Never returns an order, person, email or child. Run in the target
-- project's SQL editor immediately after applying
-- 0101_gift_checkout_requires_guardian_approval.sql.
--
-- PASS only if:
--   every column starting helper_, begin_ or apply_ is true;
--   non_gift_blocked = 0;
--   blocked_* equal the pre-check's values (same rule, now via the helper);
--   refused_payment_events = 0 straight after applying (it counts payments
--     0101 has refused since; the weekly review watches it afterwards).
-- On any failure: stop, and decide on supabase/rollback/0101_rollback.sql
-- with Blake.
with h as (
  select o.id, o.authority_status, o.payment_status, public.gift_order_checkout_block_reason(o.id) as block_reason
  from public.orders o
)
select
  -- The helper: present, not SECURITY DEFINER, search_path pinned, service_role only.
  coalesce((select not p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_proc p where p.oid = to_regprocedure('public.gift_order_checkout_block_reason(uuid)')), false) as helper_present_invoker_pinned,
  not has_function_privilege('anon', 'public.gift_order_checkout_block_reason(uuid)', 'execute') as helper_anon_denied,
  not has_function_privilege('authenticated', 'public.gift_order_checkout_block_reason(uuid)', 'execute') as helper_authenticated_denied,
  has_function_privilege('service_role', 'public.gift_order_checkout_block_reason(uuid)', 'execute') as helper_service_role_allowed,
  -- begin_gate3_checkout: 0101 body, still SECURITY DEFINER, grants unchanged from 0080.
  coalesce((select p.prosecdef and p.prosrc like '%gift_order_checkout_block_reason%' and p.prosrc like '%gift_approval_unverified%'
            from pg_proc p where p.oid = to_regprocedure('public.begin_gate3_checkout(uuid)')), false) as begin_has_check,
  has_function_privilege('authenticated', 'public.begin_gate3_checkout(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.begin_gate3_checkout(uuid)', 'execute') as begin_grants_unchanged,
  -- apply_gate3_payment_event: 0101 body, still SECURITY DEFINER, service_role only.
  coalesce((select p.prosecdef and p.prosrc like '%gift_order_checkout_block_reason%' and p.prosrc like '%paid_refused_gift_approval_invalid%'
            from pg_proc p where p.oid = to_regprocedure('public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)')), false) as apply_has_check,
  has_function_privilege('service_role', 'public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)', 'execute')
    and not has_function_privilege('anon', 'public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)', 'execute') as apply_grants_unchanged,
  -- Ordinary orders are never blocked.
  (select count(*) from h where (authority_status is null or authority_status = 'confirmed') and block_reason is not null) as non_gift_blocked,
  -- Same buckets as the pre-check.
  (select count(*) from h where authority_status in ('guardian_approval_pending', 'guardian_approved', 'guardian_declined')) as gift_orders,
  (select count(*) from h where authority_status = 'guardian_approved' and block_reason is null) as gift_genuine,
  (select count(*) from h where block_reason = 'gift_self_approved') as gift_self_approved,
  (select count(*) from h where block_reason = 'gift_approval_missing') as gift_approval_missing,
  (select count(*) from h where block_reason = 'gift_not_approved') as gift_not_approved,
  (select count(*) from h where block_reason in ('gift_self_approved', 'gift_approval_missing') and payment_status in ('order_intent', 'pending_payment')) as blocked_approved_open,
  (select count(*) from h where block_reason = 'gift_not_approved' and payment_status in ('order_intent', 'pending_payment')) as blocked_not_approved_open,
  (select count(*) from h where block_reason is not null and payment_status in ('paid', 'fulfilled')) as blocked_paid,
  (select count(*) from h where block_reason is not null) as blocked_total,
  (select count(*) from public.payment_state_events where reason like 'paid_refused_gift_approval_invalid%') as refused_payment_events;
