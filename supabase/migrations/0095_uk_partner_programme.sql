-- UK partner (creator affiliate) programme — lean first version.
--
-- Numbered 0095 to sit after every migration already reserved on other
-- branches (relationship-authorization 0088–0091, achievement reveals and
-- archive cards up to 0094). It depends only on 0080 (orders.payment_status,
-- builder_order_authority_declarations) and touches no existing table,
-- policy or function, so it can be applied before or after those.
--
-- Four tables, all service-role only (RLS on, no policies, no grants to
-- anon/authenticated): every read and write goes through server routes that
-- check staff (require-staff.ts) or the signed-in partner's own email.
--
--  partners             one row per creator: application, status, terms
--  partner_codes        the creator's Shopify discount code(s); staff
--                       create the code in Shopify Admin first (UK card
--                       variant only) and then record it here
--  partner_commissions  one row per credited order (unique order_id), so a
--                       retried orders/paid webhook can never credit twice
--  partner_payouts      a monthly bank transfer staff send by hand; bank
--                       details are never stored here
--
-- No child data anywhere: commissions hold an order id and amounts only.
--
-- Concurrency (READ COMMITTED). Payouts and voids for one partner are
-- serialised on that partner's row, and every function that locks more than
-- one thing takes locks in the same order, so they cannot deadlock:
--   1. partners row          FOR NO KEY UPDATE (does not block the FK
--                            KEY SHARE that a new commission insert takes)
--   2. partner_commissions   FOR UPDATE
--   3. orders                FOR SHARE (payout only; a refund's
--                            apply_gate3_payment_event holds FOR UPDATE on
--                            the order in its own, separate transaction and
--                            never touches partner rows)
-- A payout locks one fixed set of eligible commissions and attaches exactly
-- that set; a deferred constraint trigger then proves at commit that every
-- payout's amount equals the sum of the commissions linked to it.
-- A refund that arrives after a commission was put in a payout leaves it
-- paid (documented: staff reconcile by hand); one that arrives before voids
-- it, and the payout never includes it.

begin;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'applied' check (status in ('applied', 'active', 'paused', 'rejected')),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (email = lower(email) and char_length(email) <= 254),
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube', 'facebook', 'other')),
  profile_url text not null check (profile_url like 'https://%' and char_length(profile_url) <= 300),
  audience text not null check (char_length(audience) <= 1000),
  confirmed_adult boolean not null check (confirmed_adult),
  confirmed_uk boolean not null check (confirmed_uk),
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  commission_bps integer not null default 2000 check (commission_bps between 0 and 5000),
  customer_discount_bps integer not null default 2000 check (customer_discount_bps between 0 and 5000),
  staff_notes text check (char_length(staff_notes) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index partners_email_key on public.partners (email);

comment on table public.partners is
  'UK creator partners (0095). Adults only, UK-based, applied via /partners/apply and approved by staff. Contact data is private: never shown to anyone but staff and the partner.';

create table public.partner_codes (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  partner_id uuid not null references public.partners (id) on delete cascade,
  active boolean not null default true,
  -- The percentage the Shopify discount gives. orders/paid accepts exactly
  -- this much off (±1p rounding) and nothing else, so it must match what
  -- staff set up in Shopify Admin.
  discount_bps integer not null check (discount_bps between 0 and 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index partner_codes_partner_idx on public.partner_codes (partner_id);

create table public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  amount_pence integer not null check (amount_pence > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- The bank-transfer reference, for reconciliation. Never bank details.
  sent_reference text check (char_length(sent_reference) <= 100)
);

create index partner_payouts_partner_idx on public.partner_payouts (partner_id);

create table public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete restrict,
  code text not null,
  paid_subtotal_pence integer not null check (paid_subtotal_pence >= 0),
  commission_bps integer not null check (commission_bps between 0 and 5000),
  commission_pence integer not null check (commission_pence >= 0),
  status text not null default 'pending' check (status in ('pending', 'void', 'paid')),
  void_reason text check (void_reason in ('self_order', 'partner_inactive', 'code_inactive', 'refunded', 'cancelled', 'staff')),
  hold_until timestamptz not null,
  payout_id uuid references public.partner_payouts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'void') = (void_reason is not null)),
  check ((status = 'paid') = (payout_id is not null))
);

create index partner_commissions_partner_idx on public.partner_commissions (partner_id, status);

alter table public.partners enable row level security;
alter table public.partner_codes enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_commissions enable row level security;

revoke all on public.partners, public.partner_codes, public.partner_payouts, public.partner_commissions from public, anon, authenticated;
grant select, insert, update on public.partners, public.partner_codes, public.partner_payouts to service_role;
grant select, update on public.partner_commissions to service_role;

-- ---------------------------------------------------------------------------
-- record_uk_partner_commission: called by orders/paid once the order is paid.
-- Idempotent on order_id. Always writes a row when the code is a partner
-- code (void with a reason when it must not earn), so staff can see why.
-- ---------------------------------------------------------------------------
create or replace function public.record_uk_partner_commission(
  p_order_id uuid,
  p_code text,
  p_paid_subtotal_pence integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code record;
  v_partner record;
  v_order record;
  v_adult_user_id uuid;
  v_adult_email text;
  v_void_reason text;
  v_commission integer;
begin
  if p_paid_subtotal_pence is null or p_paid_subtotal_pence < 0 then
    raise exception 'invalid paid subtotal';
  end if;

  select * into v_code from public.partner_codes where code = upper(btrim(p_code));
  if v_code.code is null then
    return jsonb_build_object('status', 'no_partner');
  end if;

  if exists (select 1 from public.partner_commissions where order_id = p_order_id) then
    return jsonb_build_object('status', 'already_recorded');
  end if;

  select id, payment_status into v_order from public.orders where id = p_order_id;
  if v_order.id is null or v_order.payment_status not in ('paid', 'fulfilled') then
    return jsonb_build_object('status', 'order_not_paid');
  end if;

  select * into v_partner from public.partners where id = v_code.partner_id;

  select d.adult_user_id into v_adult_user_id
  from public.builder_order_authority_declarations d
  where d.order_id = p_order_id;
  if v_adult_user_id is not null then
    select lower(u.email) into v_adult_email from auth.users u where u.id = v_adult_user_id;
  end if;

  if v_partner.status is distinct from 'active' then
    v_void_reason := 'partner_inactive';
  elsif not v_code.active then
    v_void_reason := 'code_inactive';
  elsif v_adult_email is not null and v_adult_email = v_partner.email then
    -- Partners never earn on their own orders (the terms say so).
    v_void_reason := 'self_order';
  end if;

  v_commission := case when v_void_reason is null then floor(p_paid_subtotal_pence::numeric * v_partner.commission_bps / 10000)::integer else 0 end;

  insert into public.partner_commissions (order_id, partner_id, code, paid_subtotal_pence, commission_bps, commission_pence, status, void_reason, hold_until)
  values (
    p_order_id, v_partner.id, v_code.code, p_paid_subtotal_pence, v_partner.commission_bps, v_commission,
    case when v_void_reason is null then 'pending' else 'void' end, v_void_reason,
    now() + interval '45 days'
  )
  on conflict (order_id) do nothing;

  return jsonb_build_object('status', case when v_void_reason is null then 'recorded' else 'recorded_void' end, 'reason', v_void_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- void_uk_partner_commission: a refund or cancellation of a credited order
-- voids its pending commission (refunds earn nothing). A commission already
-- in a payout stays paid and is left for staff to reconcile by hand.
-- ---------------------------------------------------------------------------
create or replace function public.void_uk_partner_commission(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner_id uuid;
  v_status text;
begin
  if p_reason not in ('refunded', 'cancelled', 'staff') then
    raise exception 'invalid void reason';
  end if;

  -- partner_id never changes on a commission, so it is safe to read before
  -- locking. Lock order 1 (partner) then 2 (commission), the same as
  -- create_uk_partner_payout: a void and a payout for one partner run one
  -- after the other, never interleaved.
  select partner_id into v_partner_id from public.partner_commissions where order_id = p_order_id;
  if v_partner_id is null then
    return jsonb_build_object('status', 'none');
  end if;
  perform 1 from public.partners where id = v_partner_id for no key update;

  select status into v_status from public.partner_commissions where order_id = p_order_id for update;
  if v_status = 'pending' then
    update public.partner_commissions
    set status = 'void', void_reason = p_reason, commission_pence = 0, updated_at = now()
    where order_id = p_order_id;
    return jsonb_build_object('status', 'voided');
  end if;
  -- Already 'void', or 'paid' (in a payout): left for staff to reconcile.
  return jsonb_build_object('status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_uk_partner_payout: locks every payable commission for one partner
-- (pending, hold passed, order still paid or fulfilled) as one fixed set and
-- puts exactly that set into one payout. Refuses below the £40 minimum.
-- ---------------------------------------------------------------------------
create or replace function public.create_uk_partner_payout(p_partner_id uuid, p_staff_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_total integer;
  v_payout_id uuid;
  v_attached integer;
begin
  -- Lock order 1: the partner row. A second payout or a void for this
  -- partner waits here until this transaction ends.
  perform 1 from public.partners where id = p_partner_id for no key update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'partner_not_found', 'amount_pence', 0);
  end if;

  -- Lock order 2 and 3: the eligible commissions (FOR UPDATE) and their
  -- orders (FOR SHARE), as ONE fixed set. If a refund is changing one of
  -- these orders, this waits for it and re-checks the row, so a refunded
  -- order drops out; once locked, no order in the set can change status
  -- until this transaction ends.
  with eligible as (
    select c.id, c.commission_pence
    from public.partner_commissions c
    join public.orders o on o.id = c.order_id
    where c.partner_id = p_partner_id
      and c.status = 'pending'
      and c.hold_until <= now()
      and o.payment_status in ('paid', 'fulfilled')
    order by c.id
    for update of c
    for share of o
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[]), coalesce(sum(commission_pence), 0)::integer
  into v_ids, v_total
  from eligible;

  if v_total < 4000 then
    return jsonb_build_object('ok', false, 'reason', 'below_minimum', 'amount_pence', v_total);
  end if;

  insert into public.partner_payouts (partner_id, amount_pence, created_by)
  values (p_partner_id, v_total, p_staff_user_id)
  returning id into v_payout_id;

  -- Attach exactly the locked set, nothing else.
  update public.partner_commissions
  set status = 'paid', payout_id = v_payout_id, updated_at = now()
  where id = any (v_ids) and status = 'pending';
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(v_ids) then
    raise exception 'partner payout allocation changed while it was being created';
  end if;

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id, 'amount_pence', v_total, 'commission_count', v_attached);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payout integrity, enforced by the database at commit: every payout has at
-- least one linked commission, and its amount equals their sum. Deferred,
-- so create_uk_partner_payout can insert the payout and then attach its
-- commissions in one transaction. Also catches any other write that would
-- break it, including a manual service-role update.
-- ---------------------------------------------------------------------------
create or replace function public.assert_partner_payout_balanced(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount integer;
  v_sum integer;
  v_count integer;
begin
  if p_payout_id is null then
    return;
  end if;
  select amount_pence into v_amount from public.partner_payouts where id = p_payout_id;
  if v_amount is null then
    return;
  end if;
  select coalesce(sum(commission_pence), 0)::integer, count(*)::integer into v_sum, v_count
  from public.partner_commissions
  where payout_id = p_payout_id;
  if v_count = 0 or v_sum <> v_amount then
    raise exception 'partner payout % is % pence but its % linked commission(s) total % pence', p_payout_id, v_amount, v_count, v_sum;
  end if;
end;
$$;

create or replace function public.partner_payout_balance_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'partner_payouts' then
    perform public.assert_partner_payout_balanced(new.id);
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_partner_payout_balanced(old.payout_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.payout_id is distinct from old.payout_id) then
    perform public.assert_partner_payout_balanced(new.payout_id);
  end if;
  return null;
end;
$$;

create constraint trigger partner_payouts_balanced
after insert or update on public.partner_payouts
deferrable initially deferred
for each row execute function public.partner_payout_balance_trigger();

create constraint trigger partner_commissions_payout_balanced
after insert or update or delete on public.partner_commissions
deferrable initially deferred
for each row execute function public.partner_payout_balance_trigger();

revoke all on function public.record_uk_partner_commission(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.void_uk_partner_commission(uuid, text) from public, anon, authenticated;
revoke all on function public.create_uk_partner_payout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_partner_payout_balanced(uuid) from public, anon, authenticated, service_role;
revoke all on function public.partner_payout_balance_trigger() from public, anon, authenticated, service_role;
grant execute on function public.record_uk_partner_commission(uuid, text, integer) to service_role;
grant execute on function public.void_uk_partner_commission(uuid, text) to service_role;
grant execute on function public.create_uk_partner_payout(uuid, uuid) to service_role;

commit;
