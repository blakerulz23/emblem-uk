-- Lets an Approver promote an email that already has ANY Emblem account
-- to staff, from the same permissions admin page 0060 built. Deliberately
-- scoped to existing accounts only — a full invite flow for someone who
-- has never touched Emblem at all is a separate, bigger decision.
--
-- staff_accounts itself gets no new grant here (still zero direct
-- service_role DML, per 0037_service_role_least_privilege.sql) — this
-- function runs as postgres (security definer), which is what already has
-- auth schema access (profiles.id references auth.users(id) proves that).
-- The Supabase JS Admin API has no getUserByEmail (only getUserById/
-- deleteUser/listUsers with no email filter — checked in @supabase/auth-js),
-- so paginating every user client-side would be the only JS-side option;
-- a plain indexed `select ... from auth.users where email = ...` here is
-- both faster and consistent with every other write in this feature
-- already going through a security-definer function, never a raw grant.
--
-- No trigger creates a profiles row on signup (confirmed — none exists in
-- any migration), so profiles rows are created ad hoc across the app
-- (e.g. verify-code/route.ts's upsert). An auth.users row existing does
-- not guarantee a matching profiles row, and staff_accounts.profile_id
-- references profiles(id), not auth.users directly — so this upserts
-- profiles first, same pattern as every other place that does.
--
-- Deliberately does not grant any Squad Invite permission itself — the
-- Approver uses the existing grant_squad_invite_staff_permission toggles
-- (0060) right after, keeping this action doing one thing only.
create or replace function public.promote_email_to_staff(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid; v_already_staff boolean;
begin
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then
    return jsonb_build_object('found', false);
  end if;
  select exists(select 1 from public.staff_accounts where profile_id = v_user_id) into v_already_staff;
  insert into public.profiles(id) values (v_user_id) on conflict (id) do nothing;
  insert into public.staff_accounts(profile_id) values (v_user_id) on conflict (profile_id) do nothing;
  return jsonb_build_object('found', true, 'alreadyStaff', v_already_staff, 'profileId', v_user_id);
end;
$$;
alter function public.promote_email_to_staff(text) owner to postgres;
revoke all on function public.promote_email_to_staff(text) from public, anon, authenticated;
grant execute on function public.promote_email_to_staff(text) to service_role;
