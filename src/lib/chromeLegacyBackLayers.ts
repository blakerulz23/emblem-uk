export type LayerType = 'static' | 'dynamic' | 'optional';

export interface ChromeLegacyBackLayer {
  name: string;
  purpose: string;
  type: LayerType;
  visibilityRules: string;
  futureDataSource: string;
}

export const YC_CHROME_LEGACY_BACK = 'YC_CHROME_LEGACY_BACK';

export const CHROME_LEGACY_BACK_CANVAS = {
  width: 1054,
  height: 1492,
} as const;

// Render order bottom -> top.
export const CHROME_LEGACY_BACK_LAYERS: ChromeLegacyBackLayer[] = [
  {
    name: 'FRAME_CHROME_OUTER_BORDER',
    purpose: 'Outer chrome perimeter and card silhouette',
    type: 'static',
    visibilityRules: 'Always visible',
    futureDataSource: 'templates.frame_outer_asset_url',
  },
  {
    name: 'FRAME_CHROME_INNER_BORDER',
    purpose: 'Inner border that frames all card-back content',
    type: 'static',
    visibilityRules: 'Always visible',
    futureDataSource: 'templates.frame_inner_asset_url',
  },
  {
    name: 'FRAME_BACK_TEXTURE_PANEL',
    purpose: 'Background texture and vignette treatment for readability',
    type: 'static',
    visibilityRules: 'Always visible',
    futureDataSource: 'templates.panel_texture_asset_url',
  },
  {
    name: 'FRAME_CORNER_BEVELS',
    purpose: 'Decorative corner bevel accents',
    type: 'static',
    visibilityRules: 'Always visible',
    futureDataSource: 'templates.corner_bevel_asset_url',
  },
  {
    name: 'COMPONENT_BRAND_YC_LOGO',
    purpose: 'YC logo in header lockup',
    type: 'static',
    visibilityRules: 'Visible unless white-label partner mode is enabled',
    futureDataSource: 'brands.logo_asset_url',
  },
  {
    name: 'FRAME_BRAND_ACCENT_GLOW',
    purpose: 'Glow/highlight accent behind brand lockup',
    type: 'static',
    visibilityRules: 'Always visible unless high-contrast accessibility mode',
    futureDataSource: 'templates.brand_glow_asset_url',
  },
  {
    name: 'DATA_PLAYER_NAME',
    purpose: 'Athlete display name',
    type: 'dynamic',
    visibilityRules: 'Required',
    futureDataSource: 'athletes.display_name',
  },
  {
    name: 'COMPONENT_STORY_TITLE',
    purpose: 'Section title label for athlete story',
    type: 'static',
    visibilityRules: 'Always visible',
    futureDataSource: 'templates.story_title_asset_url',
  },
  {
    name: 'DATA_ATHLETE_STORY',
    purpose: 'Athlete story paragraph body copy',
    type: 'dynamic',
    visibilityRules: 'Required, max lines and overflow rules enforced',
    futureDataSource: 'athlete_profiles.story_short',
  },
  {
    name: 'COMPONENT_DNA_TITLE',
    purpose: 'Section title label for athlete DNA',
    type: 'static',
    visibilityRules: 'Visible when DNA section enabled',
    futureDataSource: 'templates.dna_title_asset_url',
  },
  {
    name: 'COMPONENT_DNA_ICON_LEADERSHIP',
    purpose: 'Icon for leadership trait row',
    type: 'static',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.icon_asset_url where trait_key=leadership',
  },
  {
    name: 'DATA_DNA_LEADERSHIP_LABEL',
    purpose: 'Leadership trait label',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.label where trait_key=leadership',
  },
  {
    name: 'DATA_DNA_LEADERSHIP_SCORE',
    purpose: 'Leadership score for bar renderer',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'athlete_trait_scores.score_value where trait_key=leadership',
  },
  {
    name: 'COMPONENT_DNA_ICON_WORK_ETHIC',
    purpose: 'Icon for work ethic trait row',
    type: 'static',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.icon_asset_url where trait_key=work_ethic',
  },
  {
    name: 'DATA_DNA_WORK_ETHIC_LABEL',
    purpose: 'Work ethic trait label',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.label where trait_key=work_ethic',
  },
  {
    name: 'DATA_DNA_WORK_ETHIC_SCORE',
    purpose: 'Work ethic score for bar renderer',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'athlete_trait_scores.score_value where trait_key=work_ethic',
  },
  {
    name: 'COMPONENT_DNA_ICON_COACHABILITY',
    purpose: 'Icon for coachability trait row',
    type: 'static',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.icon_asset_url where trait_key=coachability',
  },
  {
    name: 'DATA_DNA_COACHABILITY_LABEL',
    purpose: 'Coachability trait label',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.label where trait_key=coachability',
  },
  {
    name: 'DATA_DNA_COACHABILITY_SCORE',
    purpose: 'Coachability score for bar renderer',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'athlete_trait_scores.score_value where trait_key=coachability',
  },
  {
    name: 'COMPONENT_DNA_ICON_COMPETITIVE_DRIVE',
    purpose: 'Icon for competitive drive trait row',
    type: 'static',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.icon_asset_url where trait_key=competitive_drive',
  },
  {
    name: 'DATA_DNA_COMPETITIVE_DRIVE_LABEL',
    purpose: 'Competitive drive trait label',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.label where trait_key=competitive_drive',
  },
  {
    name: 'DATA_DNA_COMPETITIVE_DRIVE_SCORE',
    purpose: 'Competitive drive score for bar renderer',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'athlete_trait_scores.score_value where trait_key=competitive_drive',
  },
  {
    name: 'COMPONENT_DNA_ICON_TEAM_FIRST',
    purpose: 'Icon for team-first trait row',
    type: 'static',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.icon_asset_url where trait_key=team_first',
  },
  {
    name: 'DATA_DNA_TEAM_FIRST_LABEL',
    purpose: 'Team-first trait label',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'dna_traits.label where trait_key=team_first',
  },
  {
    name: 'DATA_DNA_TEAM_FIRST_SCORE',
    purpose: 'Team-first score for bar renderer',
    type: 'dynamic',
    visibilityRules: 'Visible when row enabled',
    futureDataSource: 'athlete_trait_scores.score_value where trait_key=team_first',
  },
  {
    name: 'FRAME_DNA_ROW_DIVIDERS',
    purpose: 'Horizontal dividers separating DNA rows',
    type: 'static',
    visibilityRules: 'Visible when DNA section enabled',
    futureDataSource: 'templates.dna_row_dividers_asset_url',
  },
  {
    name: 'NFC_PANEL_CONTAINER',
    purpose: 'Framed panel container for NFC unlock content',
    type: 'static',
    visibilityRules: 'Visible when nfc_enabled=true',
    futureDataSource: 'templates.nfc_panel_asset_url',
  },
  {
    name: 'NFC_ICON_SIGNAL',
    purpose: 'NFC signal icon on unlock panel',
    type: 'static',
    visibilityRules: 'Visible when nfc_enabled=true',
    futureDataSource: 'templates.nfc_icon_asset_url',
  },
  {
    name: 'NFC_LABEL',
    purpose: 'NFC text label',
    type: 'dynamic',
    visibilityRules: 'Visible when nfc_enabled=true',
    futureDataSource: 'cards.nfc_label or defaults.NFC_LABEL',
  },
  {
    name: 'COMPONENT_UNLOCK_TITLE',
    purpose: 'Tap-to-unlock title text block',
    type: 'dynamic',
    visibilityRules: 'Visible when nfc_enabled=true',
    futureDataSource: 'cards.unlock_title or defaults.UNLOCK_TITLE',
  },
  {
    name: 'DATA_UNLOCK_ITEM_1_LABEL',
    purpose: 'Unlock feature row label #1',
    type: 'dynamic',
    visibilityRules: 'Visible when enabled',
    futureDataSource: 'card_unlock_features[0].label',
  },
  {
    name: 'DATA_UNLOCK_ITEM_2_LABEL',
    purpose: 'Unlock feature row label #2',
    type: 'dynamic',
    visibilityRules: 'Visible when enabled',
    futureDataSource: 'card_unlock_features[1].label',
  },
  {
    name: 'DATA_UNLOCK_ITEM_3_LABEL',
    purpose: 'Unlock feature row label #3',
    type: 'dynamic',
    visibilityRules: 'Visible when enabled',
    futureDataSource: 'card_unlock_features[2].label',
  },
  {
    name: 'DATA_UNLOCK_ITEM_4_LABEL',
    purpose: 'Unlock feature row label #4',
    type: 'dynamic',
    visibilityRules: 'Visible when enabled',
    futureDataSource: 'card_unlock_features[3].label',
  },
  {
    name: 'DATA_UNLOCK_ITEM_5_LABEL',
    purpose: 'Unlock feature row label #5',
    type: 'dynamic',
    visibilityRules: 'Visible when enabled',
    futureDataSource: 'card_unlock_features[4].label',
  },
  {
    name: 'DATA_COLLECTION_NAME',
    purpose: 'Collection/footer nameplate text',
    type: 'dynamic',
    visibilityRules: 'Required',
    futureDataSource: 'card_collections.name',
  },
  {
    name: 'COMPONENT_PARTNER_BADGE',
    purpose: 'Optional partner co-branding badge',
    type: 'optional',
    visibilityRules: 'Visible when partner program active',
    futureDataSource: 'cards.partner_badge_asset_url',
  },
  {
    name: 'COMPONENT_VERIFICATION_BADGE',
    purpose: 'Optional verified-athlete marker',
    type: 'optional',
    visibilityRules: 'Visible when athletes.verified=true',
    futureDataSource: 'athletes.verified',
  },
];

export const CHROME_LEGACY_BACK_TREE = [
  'YC_CHROME_LEGACY_BACK',
  'FRAME_BASE',
  'COMPONENT_BRAND_HEADER',
  'COMPONENT_IDENTITY_BLOCK',
  'COMPONENT_STORY_BLOCK',
  'COMPONENT_DNA_BLOCK',
  'NFC_SECTION',
  'COMPONENT_COLLECTION_FOOTER',
  'OPTIONAL_VARIANTS',
] as const;
