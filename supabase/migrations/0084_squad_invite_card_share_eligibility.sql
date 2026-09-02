-- Extends guardian card sharing (migration 0078) to Squad Invite orders —
-- a FOUNDER-APPROVED, explicitly risk-accepted extension, not a silent
-- weakening.
--
-- Migration 0078's own header comment already documented why Squad Invite
-- was left out of that pass: its four commit-time declarations are a
-- separate, less specific schema than the ordinary builder's
-- builder_order_authority_declarations. Specifically, the
-- 'child_information_authority' declaration a guardian ticks at commit
-- time (see ProductionBuilder.tsx's SQUAD_INVITE_REQUIRED_DECLARATIONS)
-- reads "I am this child's parent/guardian, OR have their parent/
-- guardian's permission to submit these details" — one checkbox, two
-- different real-world relationships, with no persisted field anywhere
-- that records which one a given guardian meant. The ordinary builder's
-- own eligibility check requires relationship = 'parent_guardian'
-- specifically; Squad Invite's data model cannot make that same
-- distinction, and this migration does not invent a way to.
--
-- Founder decision (explicit, informed): turn sharing on for every
-- guardian who completed a Squad Invite commitment anyway, accepting that
-- a coach or other adult who submitted "with the parent's permission"
-- gets the same sharing access a direct parent would. This is NOT a new,
-- separately-invented weaker standard — it is the exact same trust level
-- Squad Invite already runs its core feature (creating the card at all)
-- on. Every OTHER check this pass still enforces at full strength,
-- unrelaxed: the authenticated guardian must be the exact profile who
-- completed the commitment (squad_invite_participations.guardian_profile_id
-- = auth.uid(), never trusted from a participation id or invitation token
-- alone), the two most sharing-relevant declarations
-- (child_information_authority, photograph_manufacture) must be recorded
-- as currently-granted (not withdrawn) in squad_invite_permissions — a
-- real, persisted, revocable audit table (0050), not merely a client-
-- trusted request body — the card must be a genuine single-child order,
-- must not be suspended/revoked/deletion-pending, and the design must be
-- an approved Custom Collection template on the same allowlist the
-- ordinary builder already enforces.
--
-- get_card_share_eligibility is extended additively: the ordinary
-- builder's own authorization branch (orders.source <> 'squad_invite') is
-- reproduced byte-for-byte from 0078 below, completely unchanged — this
-- migration adds a new, separate branch for orders.source = 'squad_invite'
-- rather than modifying the existing one, so the ordinary single-builder
-- sharing feature's own behaviour and test coverage are provably
-- untouched. record_card_share_consent (0078) and get_card_share_asset_key
-- (0079) both already call get_card_share_eligibility rather than
-- re-implementing its checks, so neither needs any change here.

begin;

create or replace function public.get_card_share_eligibility(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_order record;
  v_declaration record;
  v_card_count int;
  v_card record;
  v_definition record;
  v_custom_template_ids text[] := array['custom-solar', 'custom-galaxy', 'custom-comic'];
  v_participation record;
begin
  if auth.uid() is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authenticated');
  end if;
  if p_order_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  if v_order.source = 'squad_invite' then
    -- Squad Invite path (0084) — see this migration's own header comment
    -- for the full authorization model and the explicit risk it accepts.
    select * into v_participation
    from public.squad_invite_participations
    where order_id = p_order_id;

    -- guardian_profile_id must match the CALLER's own auth.uid() — never
    -- trusted from participation id, invitation token, or order id alone.
    -- status = 'started' means no commitment (and therefore no
    -- declaration) has actually been recorded yet for this participation.
    if v_participation.id is null
       or v_participation.guardian_profile_id is distinct from auth.uid()
       or v_participation.status = 'started' then
      return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
    end if;

    if not exists (
      select 1 from public.squad_invite_permissions
      where participation_id = v_participation.id
        and purpose = 'child_information_authority'
        and granted = true
        and withdrawn_at is null
    ) or not exists (
      select 1 from public.squad_invite_permissions
      where participation_id = v_participation.id
        and purpose = 'photograph_manufacture'
        and granted = true
        and withdrawn_at is null
    ) then
      return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
    end if;

    select count(*) into v_card_count from public.cards where order_id = p_order_id;
    if v_card_count is distinct from 1 then
      return jsonb_build_object('eligible', false, 'reason', 'multi_child_order');
    end if;

    select * into v_card from public.cards where order_id = p_order_id;

    if v_card.access_status is not null then
      -- suspended or revoked; a pending/active deletion request already
      -- suspends the card as a side effect of filing the request (0076).
      return jsonb_build_object(
        'eligible', false,
        'reason', case when v_card.access_status = 'revoked' then 'card_revoked' else 'card_suspended' end
      );
    end if;

    select * into v_definition
    from public.card_definitions
    where order_id = p_order_id and player_id = v_card.player_id
    order by created_at desc
    limit 1;

    if v_definition.id is null or v_definition.status is distinct from 'approved' then
      return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
    end if;

    if not (v_definition.template_id = any(v_custom_template_ids)) then
      return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
    end if;

    return jsonb_build_object(
      'eligible', true,
      'cardId', v_card.id,
      'artworkCardDefinitionId', v_definition.id
    );
  end if;

  -- ---------------------------------------------------------------------
  -- Ordinary builder path — byte-for-byte unchanged from migration 0078,
  -- comments included, so this reproduction can be diffed and verified
  -- directly against the original rather than trusted by description.
  -- ---------------------------------------------------------------------
  if v_order.authority_status is distinct from 'confirmed' then
    -- Covers guardian_approval_pending, guardian_approved, guardian_declined,
    -- and null (Squad Invite / historical orders) alike — none of them are
    -- the direct-parent-guardian case this pass supports. See this
    -- migration's own header comment for why 'guardian_approved' is
    -- deliberately excluded, not merely unimplemented by oversight.
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select * into v_declaration
  from public.builder_order_authority_declarations
  where order_id = p_order_id;

  if v_declaration.id is null
     or v_declaration.adult_user_id is distinct from auth.uid()
     or v_declaration.relationship is distinct from 'parent_guardian'
     or v_declaration.confirmed_photo_permission is distinct from true then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select count(*) into v_card_count from public.cards where order_id = p_order_id;
  if v_card_count is distinct from 1 then
    -- Whole-team / multi-player order under the ordinary builder — cannot
    -- prove a separate guardian relationship for every card. Hidden, not
    -- shown as a blocked state, since this is a builder-mode limitation,
    -- not something about this particular guardian or card.
    return jsonb_build_object('eligible', false, 'reason', 'multi_child_order');
  end if;

  select * into v_card from public.cards where order_id = p_order_id;

  if v_card.access_status is not null then
    -- suspended or revoked; a pending/active deletion request already
    -- suspends the card as a side effect of filing the request (0076), so
    -- this single check also covers "deletion pending" — no separate query.
    return jsonb_build_object(
      'eligible', false,
      'reason', case when v_card.access_status = 'revoked' then 'card_revoked' else 'card_suspended' end
    );
  end if;

  select * into v_definition
  from public.card_definitions
  where order_id = p_order_id and player_id = v_card.player_id
  order by created_at desc
  limit 1;

  if v_definition.id is null or v_definition.status is distinct from 'approved' then
    return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
  end if;

  if not (v_definition.template_id = any(v_custom_template_ids)) then
    -- Official Collection / licensed / third-party / any template not on
    -- this explicit allowlist. Allowlisting, not blocklisting, is
    -- deliberate: an unrecognised future template id fails closed by
    -- default rather than being accidentally shareable.
    return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
  end if;

  return jsonb_build_object(
    'eligible', true,
    'cardId', v_card.id,
    'artworkCardDefinitionId', v_definition.id
  );
end;
$$;

alter function public.get_card_share_eligibility(uuid) owner to postgres;
revoke all on function public.get_card_share_eligibility(uuid) from public, anon;
grant execute on function public.get_card_share_eligibility(uuid) to authenticated;

comment on function public.get_card_share_eligibility(uuid) is
  'Computed fresh on every call, never cached. Two independent authorization branches by orders.source: squad_invite (0084, guardian_profile_id + granted/non-withdrawn child_information_authority + photograph_manufacture permissions) and the ordinary builder (0078, confirmed authority_status + parent_guardian declaration), each enforcing its own full single-child/access-status/approved-design checks. Founder-approved: the Squad Invite branch cannot distinguish a direct parent from an other-adult submitting with permission, since Squad Invite''s own declaration schema does not capture that distinction — see this migration''s file header for the accepted risk.';

commit;
