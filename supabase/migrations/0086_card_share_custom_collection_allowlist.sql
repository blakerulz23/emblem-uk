-- Extends get_card_share_eligibility's (0078, extended 0084) Custom
-- Collection template allowlist to Crimson/Royal Edition/Emerald Edition/
-- Glacier Edition — the four templates added in PRs #93-96, after 0078's
-- own allowlist was written. custom-collection-manifest.ts's own
-- CustomCollectionTemplateId union has included all seven ids
-- ('custom-solar' | 'custom-galaxy' | 'custom-comic' | 'custom-crimson' |
-- 'custom-royal' | 'custom-emerald' | 'custom-glacier') since Glacier
-- merged, but nothing kept get_card_share_eligibility's own separate,
-- hardcoded v_custom_template_ids array in sync with it — an allowlist
-- that fails closed by design (0078's own comment: "an unrecognised
-- future template id fails closed by default") silently kept these four
-- unshareable ("Sharing is not available for this design" /
-- design_not_permitted) even after their player-image composition and
-- the shared html2canvas clip-path export fix (#98/#99) shipped.
--
-- This migration ONLY widens that one array literal, in both places it
-- appears (the ordinary-builder branch and the Squad Invite branch added
-- by 0084) — every other line of the function, every check, every
-- comment, is reproduced byte-for-byte from 0084. No authorization
-- boundary, no other eligibility rule, no grant/revoke is touched.
--
-- Deliberately does not touch: get_card_share_asset_key (0079) or
-- create_card_share_public_page (0085) — both already call
-- get_card_share_eligibility itself rather than re-implementing its
-- checks (see 0084's own header comment), so widening this one array is
-- sufficient for the share-image and public-share-page paths alike.
-- Printer-PDF (render-print/pdf-generator.ts) was never gated by any
-- template allowlist at all — confirmed separately, not assumed, by
-- reading both files — so it is unaffected by, and does not need, this
-- migration.

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
  v_custom_template_ids text[] := array[
    'custom-solar', 'custom-galaxy', 'custom-comic',
    'custom-crimson', 'custom-royal', 'custom-emerald', 'custom-glacier'
  ];
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
    -- Squad Invite path (0084) — see that migration's own header comment
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
  -- Ordinary builder path — byte-for-byte unchanged from migration 0078/
  -- 0084 (only v_custom_template_ids, declared once above, is wider).
  -- ---------------------------------------------------------------------
  if v_order.authority_status is distinct from 'confirmed' then
    -- Covers guardian_approval_pending, guardian_approved, guardian_declined,
    -- and null (Squad Invite / historical orders) alike — none of them are
    -- the direct-parent-guardian case this pass supports. See migration
    -- 0084's own header comment for why 'guardian_approved' is
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
  'Computed fresh on every call, never cached. Two independent authorization branches by orders.source: squad_invite (0084, guardian_profile_id + granted/non-withdrawn child_information_authority + photograph_manufacture permissions) and the ordinary builder (0078, confirmed authority_status + parent_guardian declaration), each enforcing its own full single-child/access-status/approved-design checks. v_custom_template_ids (0086) covers all seven Custom Collection templates: custom-solar, custom-galaxy, custom-comic, custom-crimson, custom-royal, custom-emerald, custom-glacier. Founder-approved: the Squad Invite branch cannot distinguish a direct parent from an other-adult submitting with permission, since Squad Invite''s own declaration schema does not capture that distinction — see migration 0084''s file header for the accepted risk.';

commit;
