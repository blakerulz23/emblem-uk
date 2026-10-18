-- Archive internal test cards out of the staff operational queues.
--
-- Additive and soft only. Nothing is ever deleted: cards, orders, players,
-- claim tokens, payment fields, payment_state_events, shopify_webhook_events
-- and every audit table keep every row exactly as it is. Archiving only sets
-- flags that the staff queues filter on, and Restore clears them again.
--
-- Guard rails live here, in the database, not in the UI:
--   * only staff holding the new test_data_admin permission can archive,
--     restore or hide (checked inside every function, not only in routes);
--   * archive_test_cards refuses any card whose order shows payment
--     evidence, any card that may physically exist (programmed/verified/
--     completed), any card claimed by a non-staff account and any card on a
--     paid or refunded Squad Invite participation;
--   * paid or refunded test orders (e.g. Shopify #1029, #1030) can only be
--     hidden through hide_financial_test_order, which requires the order to
--     be refunded or cancelled plus the short order reference typed back,
--     and writes nothing but the archive flags;
--   * every action, including every refusal, is written to an append-only
--     audit table.

-- 1. New staff permission, managed through the existing permissions admin.
alter table public.squad_invite_staff_permissions
  drop constraint squad_invite_staff_permissions_permission_check;
alter table public.squad_invite_staff_permissions
  add constraint squad_invite_staff_permissions_permission_check
  check (permission in ('squad_invite_reviewer', 'squad_invite_approver', 'test_data_admin'));

create or replace function public.grant_squad_invite_staff_permission(p_staff_profile_id uuid, p_permission text, p_granted_by_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_permission not in ('squad_invite_reviewer', 'squad_invite_approver', 'test_data_admin') then
    raise exception 'invalid permission';
  end if;
  perform 1 from public.staff_accounts where profile_id = p_staff_profile_id;
  if not found then raise exception 'staff account not found'; end if;

  insert into public.squad_invite_staff_permissions(staff_profile_id, permission, granted_by_staff_profile_id)
  values (p_staff_profile_id, p_permission, p_granted_by_staff_profile_id)
  on conflict (staff_profile_id, permission) do update set
    revoked_at = null, revoked_by_staff_profile_id = null,
    granted_by_staff_profile_id = excluded.granted_by_staff_profile_id, granted_at = now();

  return jsonb_build_object('staffProfileId', p_staff_profile_id, 'permission', p_permission, 'granted', true);
end;
$$;
alter function public.grant_squad_invite_staff_permission(uuid,text,uuid) owner to postgres;
revoke all on function public.grant_squad_invite_staff_permission(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.grant_squad_invite_staff_permission(uuid,text,uuid) to service_role;

-- 2. Archive flags (cards) and the internal-test marker (orders).
alter table public.cards
  add column archived_as_test_at timestamptz,
  add column archived_as_test_by uuid references public.staff_accounts(profile_id) on delete restrict,
  add column archive_reason text;

alter table public.orders
  add column is_internal_test boolean not null default false,
  add column internal_test_marked_at timestamptz,
  add column internal_test_marked_by uuid references public.staff_accounts(profile_id) on delete restrict;

create index idx_cards_archived_as_test_at on public.cards (archived_as_test_at) where archived_as_test_at is not null;

-- 3. Append-only audit trail.
create table public.test_archive_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('archived', 'refused', 'restored', 'hidden_financial_test')),
  card_id uuid references public.cards(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  actor_profile_id uuid not null references public.staff_accounts(profile_id) on delete restrict,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_test_archive_audit_events_card on public.test_archive_audit_events (card_id);
alter table public.test_archive_audit_events enable row level security;
revoke all on public.test_archive_audit_events from public, anon, authenticated, service_role;
grant select, insert on public.test_archive_audit_events to service_role;

-- 4. Shared permission check.
create or replace function public.has_test_data_admin(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.squad_invite_staff_permissions
    where staff_profile_id = p_actor and permission = 'test_data_admin' and revoked_at is null
  );
$$;
alter function public.has_test_data_admin(uuid) owner to postgres;
revoke all on function public.has_test_data_admin(uuid) from public, anon, authenticated;
grant execute on function public.has_test_data_admin(uuid) to service_role;

-- 5. Archive. One transaction; every card re-checked; per-card results.
create or replace function public.archive_test_cards(p_card_ids uuid[], p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_card public.cards%rowtype;
  v_order public.orders%rowtype;
  v_refusal text;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.has_test_data_admin(p_actor) then raise exception 'test_data_admin permission required'; end if;
  if p_card_ids is null or cardinality(p_card_ids) = 0 then raise exception 'no cards given'; end if;
  if cardinality(p_card_ids) > 100 then raise exception 'at most 100 cards per request'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;

  foreach v_id in array p_card_ids loop
    v_refusal := null;
    select * into v_card from public.cards where id = v_id for update;
    if not found then
      v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'refused', 'reason', 'card_not_found');
      continue;
    end if;
    if v_card.archived_as_test_at is not null then
      v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'unchanged', 'reason', 'already_archived');
      continue;
    end if;

    select * into v_order from public.orders where id = v_card.order_id for update;

    if v_card.production_status in ('programmed', 'verified', 'completed') then
      v_refusal := 'card_may_physically_exist';
    elsif v_order.id is not null and (
         v_order.payment_status in ('paid', 'refunded')
      or v_order.paid_at is not null
      or v_order.shopify_order_id is not null
      or v_order.paid_amount_pence is not null
      or exists (select 1 from public.payment_state_events e where e.order_id = v_order.id)
      or exists (select 1 from public.shopify_webhook_events w where w.order_ref = v_order.order_ref)
    ) then
      v_refusal := 'order_has_payment_evidence';
    elsif exists (
      select 1 from public.squad_invite_participations p
      where p.order_id = v_card.order_id and p.status in ('paid', 'refunded', 'production_accepted')
    ) then
      v_refusal := 'squad_invite_payment_recorded';
    elsif v_card.status = 'claimed' and exists (
      select 1 from public.guardians g
      where g.player_id = v_card.player_id
        and not exists (select 1 from public.staff_accounts s where s.profile_id = g.profile_id)
    ) then
      v_refusal := 'claimed_by_non_staff_account';
    end if;

    if v_refusal is not null then
      insert into public.test_archive_audit_events(action, card_id, order_id, actor_profile_id, reason, detail)
      values ('refused', v_card.id, v_card.order_id, p_actor, p_reason, jsonb_build_object('refusal', v_refusal));
      v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'refused', 'reason', v_refusal);
      continue;
    end if;

    update public.cards
      set archived_as_test_at = now(), archived_as_test_by = p_actor, archive_reason = p_reason
      where id = v_card.id;
    insert into public.test_archive_audit_events(action, card_id, order_id, actor_profile_id, reason, detail)
    values ('archived', v_card.id, v_card.order_id, p_actor, p_reason,
            jsonb_build_object('cardStatus', v_card.status, 'productionStatus', v_card.production_status,
                               'orderPaymentStatus', v_order.payment_status));

    -- An order whose every card is now archived is marked internal-test, so
    -- order-level queues (approvals, approved list) drop it as well.
    if v_order.id is not null and not exists (
      select 1 from public.cards c where c.order_id = v_order.id and c.archived_as_test_at is null
    ) then
      update public.orders
        set is_internal_test = true, internal_test_marked_at = now(), internal_test_marked_by = p_actor
        where id = v_order.id and is_internal_test = false;
    end if;

    v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'archived');
  end loop;

  return v_results;
end;
$$;
alter function public.archive_test_cards(uuid[], uuid, text) owner to postgres;
revoke all on function public.archive_test_cards(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.archive_test_cards(uuid[], uuid, text) to service_role;

-- 6. Restore. Clears the flags; the order goes back to the queues too.
create or replace function public.restore_test_cards(p_card_ids uuid[], p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_card public.cards%rowtype;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.has_test_data_admin(p_actor) then raise exception 'test_data_admin permission required'; end if;
  if p_card_ids is null or cardinality(p_card_ids) = 0 then raise exception 'no cards given'; end if;
  if cardinality(p_card_ids) > 100 then raise exception 'at most 100 cards per request'; end if;

  foreach v_id in array p_card_ids loop
    select * into v_card from public.cards where id = v_id for update;
    if not found or v_card.archived_as_test_at is null then
      v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'unchanged', 'reason', 'not_archived');
      continue;
    end if;
    update public.cards set archived_as_test_at = null, archived_as_test_by = null, archive_reason = null where id = v_card.id;
    update public.orders set is_internal_test = false, internal_test_marked_at = null, internal_test_marked_by = null
      where id = v_card.order_id and is_internal_test = true;
    insert into public.test_archive_audit_events(action, card_id, order_id, actor_profile_id, reason, detail)
    values ('restored', v_card.id, v_card.order_id, p_actor, null,
            jsonb_build_object('previousReason', v_card.archive_reason, 'archivedAt', v_card.archived_as_test_at));
    v_results := v_results || jsonb_build_object('cardId', v_id, 'result', 'restored');
  end loop;

  return v_results;
end;
$$;
alter function public.restore_test_cards(uuid[], uuid) owner to postgres;
revoke all on function public.restore_test_cards(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.restore_test_cards(uuid[], uuid) to service_role;

-- 7. Hide a refunded or cancelled test order (the safe path for orders with
--    payment history). Writes only archive flags and the internal-test
--    marker. Payment fields, payment events, webhook rows and Squad Invite
--    rows are never updated or deleted.
create or replace function public.hide_financial_test_order(p_order_id uuid, p_typed_order_ref text, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_short text;
  v_hidden integer;
begin
  if not public.has_test_data_admin(p_actor) then raise exception 'test_data_admin permission required'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.payment_status not in ('refunded', 'cancelled') then
    raise exception 'only refunded or cancelled orders can be hidden';
  end if;
  -- The same short reference /staff/queue shows: the order_ref's last '-' segment.
  v_short := regexp_replace(v_order.order_ref, '^.*-', '');
  if p_typed_order_ref is null or lower(trim(p_typed_order_ref)) not in (lower(v_short), lower(v_order.order_ref)) then
    raise exception 'typed order reference does not match';
  end if;
  if exists (
    select 1 from public.cards c
    where c.order_id = v_order.id and c.production_status in ('programmed', 'verified', 'completed')
  ) then
    raise exception 'a card on this order may physically exist';
  end if;

  update public.cards
    set archived_as_test_at = now(), archived_as_test_by = p_actor, archive_reason = p_reason
    where order_id = v_order.id and archived_as_test_at is null;
  get diagnostics v_hidden = row_count;
  update public.orders
    set is_internal_test = true, internal_test_marked_at = now(), internal_test_marked_by = p_actor
    where id = v_order.id;
  insert into public.test_archive_audit_events(action, card_id, order_id, actor_profile_id, reason, detail)
  values ('hidden_financial_test', null, v_order.id, p_actor, p_reason,
          jsonb_build_object('paymentStatus', v_order.payment_status, 'cardsHidden', v_hidden,
                             'hadShopifyOrder', v_order.shopify_order_id is not null));

  return jsonb_build_object('orderId', v_order.id, 'cardsHidden', v_hidden, 'paymentStatus', v_order.payment_status);
end;
$$;
alter function public.hide_financial_test_order(uuid, text, uuid, text) owner to postgres;
revoke all on function public.hide_financial_test_order(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.hide_financial_test_order(uuid, text, uuid, text) to service_role;
