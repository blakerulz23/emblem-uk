-- Adds the first *write* surface for squad_invite_staff_permissions.
-- Before this, every squad_invite_reviewer/squad_invite_approver grant was
-- a raw SQL insert with zero trace in the codebase — confirmed via
-- migration-0052-contract.test.ts, which explicitly asserts 0052 itself
-- never inserts a row (staff get no permission implicitly). This adds the
-- missing admin page's backing functions.
--
-- Live schema verified against the disposable project before writing this
-- (5 columns: staff_profile_id, permission, granted_by_staff_profile_id,
-- granted_at, revoked_at — matches 0052 exactly, no drift).

alter table public.squad_invite_staff_permissions
  add column revoked_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict;

-- Idempotent re-grant: re-granting a previously-revoked permission is the
-- same call as a first-time grant, not a special case — the on-conflict
-- branch clears revoked_at/revoked_by_staff_profile_id and refreshes
-- granted_by/granted_at, same end state either way.
create or replace function public.grant_squad_invite_staff_permission(p_staff_profile_id uuid, p_permission text, p_granted_by_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_permission not in ('squad_invite_reviewer', 'squad_invite_approver') then
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

-- Refuses to revoke the last active squad_invite_approver — that would
-- strand the system with nobody able to grant anyone else access,
-- including re-granting the very row this call just revoked.
create or replace function public.revoke_squad_invite_staff_permission(p_staff_profile_id uuid, p_permission text, p_revoked_by_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.squad_invite_staff_permissions%rowtype; v_other_approvers integer;
begin
  select * into v_row from public.squad_invite_staff_permissions
    where staff_profile_id = p_staff_profile_id and permission = p_permission for update;
  if not found then raise exception 'permission grant not found'; end if;
  if v_row.revoked_at is not null then raise exception 'permission is already revoked'; end if;

  if p_permission = 'squad_invite_approver' then
    select count(*) into v_other_approvers from public.squad_invite_staff_permissions
      where permission = 'squad_invite_approver' and revoked_at is null and staff_profile_id <> p_staff_profile_id;
    if v_other_approvers = 0 then
      raise exception 'cannot revoke the last remaining Approver';
    end if;
  end if;

  update public.squad_invite_staff_permissions set
    revoked_at = now(), revoked_by_staff_profile_id = p_revoked_by_staff_profile_id
    where staff_profile_id = p_staff_profile_id and permission = p_permission;

  return jsonb_build_object('staffProfileId', p_staff_profile_id, 'permission', p_permission, 'granted', false);
end;
$$;
alter function public.revoke_squad_invite_staff_permission(uuid,text,uuid) owner to postgres;
revoke all on function public.revoke_squad_invite_staff_permission(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.revoke_squad_invite_staff_permission(uuid,text,uuid) to service_role;
