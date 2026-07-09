'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CardArt from '@/components/builder/emblem/CardArt';
import { CARD_TEMPLATES } from '@/components/builder/emblem/data';
import { isCustomCollectionTemplateId } from '@/lib/custom-collection-manifest';
import { DEFAULT_EMJFL_CLUB, EAST_MANCHESTER_LEAGUE, EMJFL_CLUBS, getEmjflClub, preferredTemplateForClub } from '@/lib/emjfl-clubs';
import { isHollinwoodTemplateId } from '@/lib/hollinwood-manifest';
import {
  createPlayer,
  DEFAULT_CUSTOM_TEMPLATE_ID,
  defaultOrder,
  derivePlayerStatus,
  nowIso,
  productionPayload,
  selectedTemplate,
  sportConfig,
  statusCopy,
  summarizeOrder,
  templates,
  type OrderDraft,
  type OrderType,
  type PlayerDraft,
  type TemplateId,
} from '@/lib/emblem-uk-builder';

const orderTypes: Array<{ id: OrderType; title: string; copy: string; icon: 'person' | 'group' }> = [
  { id: 'single', title: 'One player', copy: 'Create one card from one football photo.', icon: 'person' },
  { id: 'squad', title: 'A whole team', copy: 'Build sibling sets, friend groups, or the full squad in one session.', icon: 'group' },
];

const collections = [
  {
    id: 'custom',
    title: 'Custom Collection',
    proof: 'Build Your Own',
    points: ['Any club or school', 'One-off events', 'Emblem badge included'],
  },
  {
    id: 'official',
    title: 'Official Collection',
    proof: 'Official Partner',
    points: ['Licensed badges', 'Official templates', 'League approved'],
  },
] as const;

const orderModeLimits: Record<OrderType, { maxPlayers: number; rosterCopy: string }> = {
  single: { maxPlayers: 1, rosterCopy: 'Single orders are capped at one approved card.' },
  set: { maxPlayers: 6, rosterCopy: 'Sets are built for two to six cards in one session.' },
  squad: { maxPlayers: 40, rosterCopy: 'Squad orders support bulk photo upload and team-level approval.' },
};

const steps = ['Choose club', 'Upload photos', 'Personalise cards', 'Approve cards', 'Review order'];
type CardSide = 'front' | 'back';
type EnquiryStatus = 'idle' | 'sending' | 'sent' | 'error';
type UploadedOrderAsset = {
  key: string;
  url: string;
  contentType?: string;
  fileName?: string;
  size?: number;
};

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function statusClass(status: string) {
  return `builder-status builder-status-${status}`;
}

const emjflTemplate = CARD_TEMPLATES.find((template) => template.id === 'emjfl-official') || CARD_TEMPLATES[0];
const cardArtTemplatesById = new Map(CARD_TEMPLATES.map((template) => [template.id, template]));

function cardArtTemplate(templateId: TemplateId) {
  return cardArtTemplatesById.get(templateId) || emjflTemplate;
}

function canAddPlayer(order: OrderDraft) {
  return order.players.length < orderModeLimits[order.type].maxPlayers;
}

function nextClubId(order: OrderDraft) {
  const used = new Set(order.players.map((player) => player.emjflClubId).filter(Boolean));
  return EMJFL_CLUBS.find((club) => !used.has(club.id))?.id || DEFAULT_EMJFL_CLUB.id;
}

function playerLabel(player: PlayerDraft, index?: number) {
  return player.name.trim() || `Player ${typeof index === 'number' ? index + 1 : 1}`;
}

function missingItems(player: PlayerDraft) {
  const missing: string[] = [];
  if (!player.photo?.srcUrl) missing.push('photo');
  if (!player.name.trim()) missing.push('name');
  if (!player.kitNo.trim()) missing.push('kit number');
  if (!player.position.trim()) missing.push('position');
  return missing;
}

function completionScore(player: PlayerDraft) {
  const fields = [Boolean(player.photo?.srcUrl), Boolean(player.name.trim()), Boolean(player.kitNo.trim()), Boolean(player.position.trim())];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function reviewActionCopy(player: PlayerDraft) {
  const missing = missingItems(player);
  if (missing.includes('photo')) return 'Add photo';
  if (missing.length > 0) return `Add ${missing[0]}`;
  return 'Continue editing';
}

function playerClubId(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') return 'custom-club';
  return player?.emjflClubId || order.emjflClubId || DEFAULT_EMJFL_CLUB.id;
}

function playerClubName(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') return player?.club || order.club || 'Custom Collection';
  return player?.club || getEmjflClub(playerClubId(order, player)).name || order.club;
}

function playerBadge(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') return player?.badgeUrl || order.badgeUrl || '/emblem-brand.png';
  return player?.badgeUrl || (player?.emjflClubId ? getEmjflClub(player.emjflClubId).badgePath : order.badgeUrl) || getEmjflClub(playerClubId(order, player)).badgePath;
}

function groupPlayersByClub(order: OrderDraft, players: PlayerDraft[]) {
  const groups = new Map<string, { id: string; name: string; badge: string; players: PlayerDraft[] }>();

  players.forEach((player) => {
    const id = playerClubId(order, player);
    const existing = groups.get(id);
    if (existing) {
      existing.players.push(player);
      return;
    }
    groups.set(id, {
      id,
      name: playerClubName(order, player),
      badge: playerBadge(order, player),
      players: [player],
    });
  });

  return Array.from(groups.values());
}

function isLocalAssetUrl(url?: string) {
  return Boolean(url && (url.startsWith('blob:') || url.startsWith('data:')));
}

async function uploadOrderAsset(sourceUrl: string, meta: { orderId: string; playerId: string; kind: 'photo' | 'badge'; fileName?: string }) {
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`Could not read ${meta.kind} upload`);
  const blob = await source.blob();
  const fileName = meta.fileName || `${meta.kind}.${blob.type.split('/')[1] || 'jpg'}`;
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  const form = new FormData();
  form.append('file', file);
  form.append('orderId', meta.orderId);
  form.append('playerId', meta.playerId);
  form.append('kind', meta.kind);

  const response = await fetch('/api/order-assets', {
    method: 'POST',
    body: form,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Could not upload ${meta.kind}`);
  }
  return result as UploadedOrderAsset;
}

export default function ProductionBuilder() {
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<OrderDraft>(() => {
    const draft = defaultOrder();
    const mode = searchParams.get('mode');
    if (mode === 'set' || mode === 'friend-set' || mode === 'siblings') {
      return { ...draft, type: 'set' };
    }
    if (mode === 'squad' || mode === 'team' || mode === 'group') {
      return { ...draft, type: 'squad' };
    }
    return draft;
  });
  const [activeStep, setActiveStep] = useState(0);
  const [selectedId, setSelectedId] = useState(order.players[0]?.id || '');
  const [showPayload, setShowPayload] = useState(false);
  const [cardSide, setCardSide] = useState<CardSide>('front');
  const [enquiryStatus, setEnquiryStatus] = useState<EnquiryStatus>('idle');
  const [enquiryError, setEnquiryError] = useState('');
  const [enquiry, setEnquiry] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });

  const selectedPlayer = order.players.find((player) => player.id === selectedId) || order.players[0];
  const summary = useMemo(() => summarizeOrder(order), [order]);
  const reviewGroups = useMemo(() => groupPlayersByClub(order, order.players), [order]);
  const approvedGroups = useMemo(() => groupPlayersByClub(order, summary.approvedPlayers), [order, summary.approvedPlayers]);
  const stats = sportConfig[order.sport].stats;
  const orderMode = orderModeLimits[order.type];
  const visibleOrderType = order.type === 'single' ? 'single' : 'squad';
  const addDisabled = !canAddPlayer(order);
  const hasAnyPhoto = order.players.some((player) => Boolean(player.photo?.srcUrl));
  const selectedHasPhoto = Boolean(selectedPlayer?.photo?.srcUrl);
  const canSendEnquiry = summary.checkoutEligible && enquiry.name.trim().length > 1 && /\S+@\S+\.\S+/.test(enquiry.email);
  const canManageAsTeam = order.type !== 'single' || order.players.length > 1;
  const reviewPrimaryLabel = summary.checkoutEligible ? 'Continue to order' : summary.counts.ready > 0 ? 'Approve ready cards' : 'Continue';
  const reviewPrimaryDisabled = !summary.checkoutEligible && summary.counts.ready === 0;
  const reviewHelper = summary.checkoutEligible
    ? summary.counts.ready > 0 || summary.counts['needs-photo'] > 0 || summary.counts['needs-details'] > 0
      ? 'You can continue with approved cards now, or finish the remaining cards first.'
      : 'All approved cards are ready for the order summary.'
    : summary.counts.ready > 0
      ? 'Approve ready cards to unlock the order summary.'
      : 'Complete at least one card before continuing.';
  const canEditOrder = enquiryStatus !== 'sent';

  const patchOrder = (patch: Partial<OrderDraft>) => {
    setOrder((current) => ({ ...current, ...patch }));
  };

  const selectOrderClub = (clubId: string) => {
    const club = getEmjflClub(clubId);
    const preferredTemplate = preferredTemplateForClub(clubId) as TemplateId;
    setOrder((current) => ({
      ...current,
      collectionType: 'official',
      collectionName: EAST_MANCHESTER_LEAGUE,
      emjflClubId: club.id,
      club: club.name,
      league: EAST_MANCHESTER_LEAGUE,
      badgeUrl: undefined,
      templateDefault: preferredTemplate,
      players: current.players.map((player) => ({
        ...player,
        club: current.collectionType === 'custom' || !player.clubEdited ? club.name : player.club,
        emjflClubId: current.collectionType === 'custom' || !player.clubEdited ? club.id : player.emjflClubId,
        templateId: player.templateId && !isCustomCollectionTemplateId(player.templateId) ? player.templateId : preferredTemplate,
        updatedAt: nowIso(),
      })),
    }));
  };

  const selectCollection = (collectionType: OrderDraft['collectionType']) => {
    if (collectionType === 'official') {
      selectOrderClub(order.emjflClubId || DEFAULT_EMJFL_CLUB.id);
      return;
    }

    setOrder((current) => {
      const customClub = current.collectionType === 'custom' ? current.club : '';
      const customTemplate = isCustomCollectionTemplateId(current.templateDefault) ? current.templateDefault : DEFAULT_CUSTOM_TEMPLATE_ID;
      return {
        ...current,
        collectionType: 'custom',
        collectionName: 'Custom Collection',
        league: undefined,
        emjflClubId: undefined,
        club: customClub,
        templateDefault: customTemplate,
        players: current.players.map((player) => ({
          ...player,
          club: current.collectionType === 'custom' ? player.club || customClub : '',
          emjflClubId: undefined,
          badgeUrl: player.badgeUrl || current.badgeUrl,
          clubEdited: true,
          templateId: player.templateId && isCustomCollectionTemplateId(player.templateId) ? player.templateId : customTemplate,
          updatedAt: nowIso(),
        })),
      };
    });
  };

  const updateCustomClub = (club: string) => {
    setOrder((current) => ({
      ...current,
      club,
      players: current.players.map((player) => ({
        ...player,
        club: current.collectionType === 'custom' ? club : player.clubEdited ? player.club : club,
        updatedAt: nowIso(),
      })),
    }));
  };

  const assignOrderBadge = (file?: File) => {
    if (!file) return;
    const badgeUrl = URL.createObjectURL(file);
    setOrder((current) => ({
      ...current,
      badgeUrl,
      players: current.players.map((player) => ({
        ...player,
        badgeUrl: current.collectionType === 'custom' ? badgeUrl : player.badgeUrl || badgeUrl,
        clubEdited: true,
        updatedAt: nowIso(),
      })),
    }));
  };

  const selectPlayerClub = (playerId: string, clubId: string) => {
    const club = getEmjflClub(clubId);
    patchPlayer(playerId, {
      club: club.name,
      emjflClubId: club.id,
      clubEdited: true,
      badgeUrl: undefined,
      templateId: preferredTemplateForClub(club.id) as TemplateId,
    });
  };

  const patchPlayer = (id: string, patch: Partial<PlayerDraft>) => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.id !== id) return player;
        if (player.approvedAt && !confirm('This card is approved. Editing it will require re-approval. Continue?')) {
          return player;
        }
        return { ...player, ...patch, updatedAt: nowIso() };
      }),
    }));
  };

  const addPlayer = (seed?: Partial<PlayerDraft>, options?: { step?: number; promoteSingle?: boolean }) => {
    const nextType: OrderType = options?.promoteSingle && order.type === 'single' ? 'set' : order.type;
    if (order.players.length >= orderModeLimits[nextType].maxPlayers) return;
    const player = createPlayer({
      stats: Object.fromEntries(stats.map((stat) => [stat.key, ''])),
      templateId: order.templateDefault,
      club: order.club,
      emjflClubId: order.emjflClubId,
      ...seed,
    });
    setOrder((current) => ({ ...current, type: nextType, players: [...current.players, player] }));
    setSelectedId(player.id);
    setActiveStep(options?.step ?? 1);
  };

  const addPlayerToClub = (clubId: string, step = 1) => {
    const club = getEmjflClub(clubId);
    addPlayer({
      club: club.name,
      emjflClubId: club.id,
      clubEdited: true,
      templateId: preferredTemplateForClub(club.id) as TemplateId,
    }, { step, promoteSingle: true });
  };

  const addPlayerToCurrentTeam = (step = 1) => {
    if (order.collectionType === 'custom') {
      addPlayer({
        club: order.club,
        badgeUrl: order.badgeUrl,
        clubEdited: true,
        templateId: order.templateDefault,
      }, { step, promoteSingle: true });
      return;
    }
    addPlayerToClub(order.emjflClubId || DEFAULT_EMJFL_CLUB.id, step);
  };

  const addTeam = () => {
    if (order.collectionType === 'custom') {
      addPlayer({
        club: '',
        badgeUrl: undefined,
        clubEdited: true,
        templateId: order.templateDefault,
      }, { step: 0, promoteSingle: true });
      return;
    }
    addPlayerToClub(nextClubId(order), 1);
  };

  const handleReviewPrimary = () => {
    if (summary.checkoutEligible) {
      setActiveStep(4);
      return;
    }
    if (summary.counts.ready > 0) approveAllReady();
  };

  const removePlayer = (id: string) => {
    setOrder((current) => {
      const next = current.players.filter((player) => player.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id || '');
      return { ...current, players: next };
    });
  };

  const duplicatePlayer = (player: PlayerDraft) => {
    if (!canAddPlayer(order)) return;
    const copy = createPlayer({
      name: player.name ? `${player.name} copy` : '',
      club: player.club || order.club,
      badgeUrl: player.badgeUrl,
      emjflClubId: player.emjflClubId || order.emjflClubId,
      clubEdited: player.clubEdited,
      position: player.position,
      kitNo: '',
      stats: player.stats,
      templateId: player.templateId || order.templateDefault,
      prints: player.prints,
    });
    setOrder((current) => ({ ...current, players: [...current.players, copy] }));
    setSelectedId(copy.id);
  };

  const approvePlayer = (id: string) => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id && derivePlayerStatus(player) === 'ready'
          ? { ...player, approvedAt: nowIso(), updatedAt: nowIso() }
          : player,
      ),
    }));
  };

  const approveAllReady = () => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) =>
        derivePlayerStatus(player) === 'ready' ? { ...player, approvedAt: nowIso(), updatedAt: nowIso() } : player,
      ),
    }));
  };

  const assignPhoto = (id: string, file?: File) => {
    if (!file) return;
    patchPlayer(id, {
      photo: {
        srcUrl: URL.createObjectURL(file),
        hiResUrl: URL.createObjectURL(file),
        crop: { x: 0, y: 0, scale: 1 },
        bgRemoved: false,
        fileName: file.name,
      },
    });
    setSelectedId(id);
    setActiveStep(2);
  };

  const assignPlayerBadge = (id: string, file?: File) => {
    if (!file) return;
    patchPlayer(id, { badgeUrl: URL.createObjectURL(file), clubEdited: true });
  };

  const orderWithUploadedAssets = async () => {
    const approvedIds = new Set(summary.approvedPlayers.map((player) => player.id));
    const uploaded = new Map<string, Promise<UploadedOrderAsset>>();

    const uploadOnce = (url: string, meta: { playerId: string; kind: 'photo' | 'badge'; fileName?: string }) => {
      const cacheKey = `${meta.kind}:${url}`;
      if (!uploaded.has(cacheKey)) {
        uploaded.set(cacheKey, uploadOrderAsset(url, {
          orderId: order.id,
          playerId: meta.playerId,
          kind: meta.kind,
          fileName: meta.fileName,
        }));
      }
      return uploaded.get(cacheKey)!;
    };

    const players = await Promise.all(order.players.map(async (player) => {
      if (!approvedIds.has(player.id)) return player;

      let nextPlayer = { ...player };
      const photoUrl = player.photo?.hiResUrl || player.photo?.srcUrl;
      if (player.photo && photoUrl && isLocalAssetUrl(photoUrl)) {
        const asset = await uploadOnce(photoUrl, {
          playerId: player.id,
          kind: 'photo',
          fileName: player.photo.fileName,
        });
        nextPlayer = {
          ...nextPlayer,
          photo: {
            ...player.photo,
            srcUrl: asset.url,
            hiResUrl: asset.url,
            storageUrl: asset.url,
            storageKey: asset.key,
            contentType: asset.contentType,
            fileName: asset.fileName || player.photo.fileName,
            uploadedAt: nowIso(),
          },
        };
      }

      if (player.badgeUrl && isLocalAssetUrl(player.badgeUrl)) {
        const asset = await uploadOnce(player.badgeUrl, {
          playerId: player.id,
          kind: 'badge',
          fileName: `${playerClubName(order, player)} badge`,
        });
        nextPlayer = {
          ...nextPlayer,
          badgeUrl: asset.url,
          badgeStorageKey: asset.key,
        };
      }

      return nextPlayer;
    }));

    return { ...order, players };
  };

  const bulkPhotos = (files: FileList | null) => {
    const emptyPhotoSlots = order.players.filter((player) => !player.photo).length;
    const remainingSlots = orderMode.maxPlayers - order.players.length;
    const imageFiles = Array.from(files || [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, emptyPhotoSlots + remainingSlots));

    if (imageFiles.length === 0) return;

    const photoAssets = imageFiles.map((file) => ({
      srcUrl: URL.createObjectURL(file),
      hiResUrl: URL.createObjectURL(file),
      crop: { x: 0, y: 0, scale: 1 },
      bgRemoved: false,
      fileName: file.name,
    }));

    setOrder((current) => {
      const players = [...current.players];
      const maxPlayers = orderModeLimits[current.type].maxPlayers;
      let photoIndex = 0;

      for (let index = 0; index < players.length && photoIndex < photoAssets.length; index += 1) {
        if (!players[index].photo) {
          players[index] = { ...players[index], photo: photoAssets[photoIndex], updatedAt: nowIso() };
          photoIndex += 1;
        }
      }

      while (photoIndex < photoAssets.length && players.length < maxPlayers) {
        players.push(createPlayer({
          stats: Object.fromEntries(stats.map((stat) => [stat.key, ''])),
          templateId: current.templateDefault,
          club: current.club,
          emjflClubId: current.emjflClubId,
          photo: photoAssets[photoIndex],
        }));
        photoIndex += 1;
      }

      setSelectedId(players[players.length - 1]?.id || selectedId);
      setActiveStep(current.type !== 'single' ? 1 : 2);
      return { ...current, players };
      });
  };

  const exportPayload = () => {
    const blob = new Blob([JSON.stringify({ contact: enquiry, ...productionPayload(order) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emblem-production-${order.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendEnquiry) return;
    setEnquiryStatus('sending');
    setEnquiryError('');

    try {
      const productionOrder = await orderWithUploadedAssets();
      const response = await fetch('/api/order-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: enquiry,
          submittedAt: nowIso(),
          ...productionPayload(productionOrder),
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Could not send enquiry');
      }

      setEnquiryStatus('sent');
    } catch (error) {
      setEnquiryStatus('error');
      setEnquiryError(error instanceof Error ? error.message : 'Could not send enquiry');
    }
  };

  const progress = ((activeStep + 1) / steps.length) * 100;
  const progressLabel = activeStep >= 3
    ? `${order.players.length} player${order.players.length === 1 ? '' : 's'} - ${summary.counts.approved} approved`
    : steps[activeStep];
  const goBack = () => setActiveStep((step) => Math.max(0, step - 1));
  const selectedIndex = selectedPlayer ? order.players.findIndex((player) => player.id === selectedPlayer.id) : -1;
  const selectAdjacentPlayer = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextPlayer = order.players[selectedIndex + direction];
    if (nextPlayer) setSelectedId(nextPlayer.id);
  };
  const chooseTemplate = (templateId: TemplateId) => {
    patchOrder({ templateDefault: templateId });
    if (selectedPlayer) patchPlayer(selectedPlayer.id, { templateId });
  };
  const orderedTemplates = useMemo(() => {
    const collectionTemplates = templates.filter((template) =>
      order.collectionType === 'custom'
        ? isCustomCollectionTemplateId(template.id)
        : !isCustomCollectionTemplateId(template.id),
    );
    if (order.collectionType === 'custom') return collectionTemplates;
    const preferred = preferredTemplateForClub(playerClubId(order, selectedPlayer));
    return [...collectionTemplates].sort((a, b) => {
      if (a.id === preferred) return -1;
      if (b.id === preferred) return 1;
      return 0;
    });
  }, [order, selectedPlayer]);

  return (
    <div className="uk-builder-shell uk-wizard-shell">
      <div className="uk-wizard-phone">
        <header className="uk-wizard-header">
          <div className="uk-wizard-topbar">
            <button type="button" className="uk-icon-button" onClick={goBack} aria-label="Back" disabled={activeStep === 0}>
              &lsaquo;
            </button>
            <div className="uk-wizard-brand" aria-label="Emblem">
              <span />
              <strong>EMBLEM</strong>
            </div>
            <button
              type="button"
              className="uk-progress-pill"
              aria-label={progressLabel}
              onClick={() => setActiveStep(summary.checkoutEligible ? 4 : 3)}
              disabled={activeStep < 2 && !summary.checkoutEligible}
            >
              {progressLabel}
            </button>
          </div>
          <div className="uk-wizard-progress">
            <div><span style={{ width: `${progress}%` }} /></div>
            <b>{String(activeStep + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')} &middot; {steps[activeStep]}</b>
          </div>
        </header>

        <main className="uk-wizard-screen">
          {activeStep === 0 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Start order</p>
              <h1>Who are you building for?</h1>
              <p className="uk-wizard-copy">Two quick choices, then we'll start the card.</p>
              <div className="uk-choice-step">
                <span>Step 1</span>
                <h2>Choose order type</h2>
              </div>
              <div className="uk-wizard-choice-list">
                {orderTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={visibleOrderType === type.id ? 'active' : ''}
                    onClick={() => patchOrder({ type: type.id })}
                  >
                    <span className="uk-choice-icon" aria-hidden="true">
                      {type.icon === 'person' ? (
                        <svg viewBox="0 0 24 24" role="img">
                          <circle cx="12" cy="8" r="3.5" />
                          <path d="M5.8 20c0-4 2.7-7 6.2-7s6.2 3 6.2 7" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" role="img">
                          <circle cx="9" cy="8.5" r="3" />
                          <circle cx="16.5" cy="9.5" r="2.5" />
                          <path d="M3.8 20c0-3.8 2.3-6.3 5.2-6.3s5.2 2.5 5.2 6.3" />
                          <path d="M13.8 15c2.8.2 4.7 2.3 4.7 5" />
                        </svg>
                      )}
                    </span>
                    <span>
                      <strong>{type.title}</strong>
                      <small>{type.copy}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="uk-collection-choice">
                <div className="uk-choice-step">
                  <span>Step 2</span>
                  <h2>Choose collection</h2>
                </div>
                <div className="uk-collection-options">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className={order.collectionType === collection.id ? 'active' : ''}
                      onClick={() => selectCollection(collection.id)}
                    >
                      <span>
                        <strong>{collection.title}</strong>
                        <em>{collection.proof}</em>
                      </span>
                      <ul>
                        {collection.points.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>
              <div className="uk-wizard-fields">
                {order.collectionType === 'official' ? (
                  <>
                    <label>
                      Season
                      <input value={order.season} onChange={(event) => patchOrder({ season: event.target.value })} />
                    </label>
                    <label>
                      Collection
                      <input value={order.league || EAST_MANCHESTER_LEAGUE} readOnly />
                    </label>
                    <div className="uk-wizard-club-row">
                      <label>
                        Club
                        <select
                          value={order.emjflClubId || DEFAULT_EMJFL_CLUB.id}
                          onChange={(event) => selectOrderClub(event.target.value)}
                        >
                          {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                      </label>
                      <img src={playerBadge(order)} alt="" />
                    </div>
                    <div className="uk-selection-proof">
                      <strong>Official Partner</strong>
                      <small>{EAST_MANCHESTER_LEAGUE} approved collection with licensed club badges.</small>
                    </div>
                  </>
                ) : (
                  <div className="uk-wizard-custom-card">
                    <label>
                      Club / team name <em>optional</em>
                      <input
                        value={order.club}
                        onChange={(event) => updateCustomClub(event.target.value)}
                        placeholder="Enter your club or team name"
                      />
                    </label>
                  </div>
                )}
              </div>
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStep(1)}>Continue</button>
            </section>
          )}

          {activeStep === 1 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Upload photos</p>
              <h1>{order.type !== 'single' ? 'Upload your squad.' : 'Start with a photo.'}</h1>
              <p className="uk-wizard-copy">
                {order.type !== 'single' ? 'Drop in every player photo together, then complete each card in the queue.' : 'Pick the football photo you want to turn into a card.'}
              </p>
              {order.type === 'single' && selectedPlayer && !selectedHasPhoto && (
                <div className="uk-photo-carousel single">
                  <label className="uk-upload-card active">
                    <span>â–§</span>
                    <strong>Upload photo</strong>
                    <small>Pick one football photo from your files.</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}

              {order.type === 'single' && selectedPlayer && selectedHasPhoto && (
                <div className="uk-single-upload-summary">
                  <span className="uk-player-strip-photo">
                    <img src={selectedPlayer.photo?.srcUrl} alt="" />
                  </span>
                  <div>
                    <small>Photo added</small>
                    <strong>{playerLabel(selectedPlayer)}</strong>
                    <span>{selectedPlayer.photo?.fileName || 'Ready to customise'}</span>
                  </div>
                  <label>
                    Replace photo
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}

              {order.type !== 'single' && !hasAnyPhoto && (
                <div className="uk-photo-carousel team">
                  <label className="uk-upload-card active">
                    <span>â–§</span>
                    <strong>Upload player photos</strong>
                    <small>Select one photo, or choose several at once.</small>
                    <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                  </label>
                  <button type="button" className="uk-upload-card" onClick={() => addPlayer()} disabled={addDisabled}>
                    <span>ï¼‹</span>
                    <strong>Add manually</strong>
                    <small>Create a player row before adding their photo.</small>
                  </button>
                </div>
              )}

              {order.type !== 'single' && hasAnyPhoto && selectedPlayer && (
                <div className="uk-collapsed-upload-actions">
                  <label>
                    Add photos
                    <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                  </label>
                  <label>
                    Replace selected photo
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}
              {false && (
              <div className="uk-photo-carousel">
                {selectedPlayer && (
                  <label className="uk-upload-card active">
                    <span>â–§</span>
                    <strong>{selectedPlayer.photo ? 'Replace photo' : 'Upload a photo'}</strong>
                    <small>{selectedPlayer.photo?.fileName || 'Pick one from your files.'}</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                )}
                <label className="uk-upload-card">
                  <span>ï¼‹</span>
                  <strong>{order.type === 'single' ? 'Use another photo' : 'Bulk upload'}</strong>
                  <small>{order.type === 'single' ? 'Replace the selected player photo.' : 'Create cards from several player photos.'}</small>
                  <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                </label>
              </div>
              )}
              {order.type !== 'single' && (hasAnyPhoto || order.players.length > 1) ? (
                <SquadUploadQueue
                  order={order}
                  selectedId={selectedId}
                  summary={summary}
                  canAdd={!addDisabled}
                  onSelect={setSelectedId}
                  onPatch={patchPlayer}
                  onPhoto={assignPhoto}
                  onRemove={removePlayer}
                  onDuplicate={duplicatePlayer}
                  onAdd={() => addPlayer()}
                />
              ) : order.type === 'single' ? (
                <PlayerStrip order={order} selectedId={selectedId} onSelect={setSelectedId} />
              ) : null}
              <div className="uk-wizard-row-actions">
                {order.type !== 'single' && <button type="button" onClick={() => addPlayer()} disabled={addDisabled}>Add player</button>}
                <button type="button" className="uk-wizard-primary compact" onClick={() => setActiveStep(2)} disabled={!hasAnyPhoto}>Personalise cards</button>
              </div>
            </section>
          )}

          {activeStep === 2 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Personalise cards</p>
              <h1>Make it yours.</h1>
              <p className="uk-wizard-copy">Choose the look, edit the details and approve each card when it is ready.</p>
              {order.type !== 'single' && (
                <div className="uk-squad-edit-bar">
                  <button type="button" onClick={() => selectAdjacentPlayer(-1)} disabled={selectedIndex <= 0}>Previous</button>
                  <span>{selectedIndex + 1} of {order.players.length}</span>
                  <button type="button" onClick={() => selectAdjacentPlayer(1)} disabled={selectedIndex >= order.players.length - 1}>Next</button>
                </div>
              )}
              <div className="uk-personalise-style">
                <div className="uk-personalise-style-head">
                  <span>
                    <strong>{selectedTemplate(order, selectedPlayer).name}</strong>
                    <small>Swipe to change style</small>
                  </span>
                  <em>{order.collectionType === 'custom' ? 'Custom collection style' : `Best match for ${playerClubName(order, selectedPlayer)}`}</em>
                </div>
                <div className="uk-style-carousel compact">
                  {orderedTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={selectedTemplate(order, selectedPlayer).id === template.id ? 'active' : ''}
                      onClick={() => chooseTemplate(template.id)}
                    >
                      <PlayerCard
                        order={{ ...order, templateDefault: template.id }}
                        player={selectedPlayer ? { ...selectedPlayer, templateId: template.id } : createPlayer({ templateId: template.id })}
                        compact
                      />
                      <strong>{template.name}</strong>
                      {order.collectionType === 'official' && template.id === preferredTemplateForClub(playerClubId(order, selectedPlayer)) && <small>Best match</small>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="uk-edit-preview">
                <PlayerCard order={order} player={selectedPlayer} side={cardSide} />
              </div>
              {selectedPlayer.photo ? (
                <div className="uk-crop-controls">
                  <label>
                    Zoom <b>{selectedPlayer.photo.crop.scale.toFixed(1)}x</b>
                    <input
                      type="range"
                      min={0.7}
                      max={1.8}
                      step={0.05}
                      value={selectedPlayer.photo.crop.scale}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, scale: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                  <label>
                    Horizontal <b>{selectedPlayer.photo.crop.x}</b>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={1}
                      value={selectedPlayer.photo.crop.x}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, x: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                  <label>
                    Vertical <b>{selectedPlayer.photo.crop.y}</b>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={1}
                      value={selectedPlayer.photo.crop.y}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, y: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                </div>
              ) : (
                <label className="uk-photo-needed">
                  <strong>Upload player photo</strong>
                  <span>Add the photo first, then the positioning tools will appear.</span>
                  <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                </label>
              )}
              <div className="uk-card-side-toggle wide" aria-label="Choose card side">
                <button type="button" className={cardSide === 'front' ? 'active' : ''} onClick={() => setCardSide('front')}>Front</button>
                <button type="button" className={cardSide === 'back' ? 'active' : ''} onClick={() => setCardSide('back')}>Back</button>
              </div>
              <PlayerEditor order={order} player={selectedPlayer} onPatch={patchPlayer} onPhoto={assignPhoto} onClub={selectPlayerClub} onBadge={assignPlayerBadge} />
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStep(3)}>Approve cards</button>
            </section>
          )}

          {activeStep === 3 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Approve cards</p>
              <h1>Ready for production?</h1>
              <p className="uk-wizard-copy">Complete each card, then approve the ones you want printed.</p>
              {canManageAsTeam ? (
                <div className="uk-review-toolbar">
                  <button type="button" onClick={() => addPlayerToCurrentTeam()} disabled={!canAddPlayer({ ...order, type: order.type === 'single' ? 'set' : order.type })}>
                    Add player
                  </button>
                  <button type="button" onClick={addTeam} disabled={!canAddPlayer({ ...order, type: order.type === 'single' ? 'set' : order.type })}>
                    Add another team
                  </button>
                </div>
              ) : null}
              <div className="uk-review-groups">
                {reviewGroups.map((group) => (
                  <section key={group.id} className="uk-review-group">
                    <header className="uk-review-group-head">
                      <img src={group.badge} alt="" />
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.players.length} card{group.players.length === 1 ? '' : 's'}</span>
                      </div>
                      {canManageAsTeam ? (
                        <button type="button" onClick={() => order.collectionType === 'custom' ? addPlayerToCurrentTeam() : addPlayerToClub(group.id)} disabled={addDisabled}>
                          Add player
                        </button>
                      ) : null}
                    </header>
                    <div className="uk-review-list">
                      {group.players.map((player) => {
                        const index = order.players.findIndex((item) => item.id === player.id);
                        const status = derivePlayerStatus(player);
                        const missing = missingItems(player);
                        const score = completionScore(player);
                        return (
                          <article key={player.id}>
                            <PlayerCard order={order} player={player} compact />
                            <div>
                              <h3>{playerLabel(player, index)}</h3>
                              <p>{selectedTemplate(order, player).name} &middot; {playerClubName(order, player)} &middot; #{player.kitNo || '--'} &middot; Qty {player.prints}</p>
                              <span className={statusClass(status)}>{statusCopy[status]}</span>
                              <div className="uk-completion-meter" aria-label={`${score}% complete`}>
                                <span style={{ width: `${score}%` }} />
                              </div>
                              <small>{score}% complete</small>
                              {missing.length > 0 && <em>Missing {missing.join(', ')}</em>}
                            </div>
                            {status === 'ready' ? (
                              <button type="button" onClick={() => approvePlayer(player.id)}>Approve card</button>
                            ) : status === 'approved' ? (
                              <button type="button" className="approved" onClick={() => setActiveStep(4)}>Ready</button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(player.id);
                                  setActiveStep(2);
                                }}
                              >
                                {reviewActionCopy(player)}
                              </button>
                            )}
                            <div className="uk-review-card-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(player.id);
                                  setActiveStep(2);
                                }}
                              >
                                Edit card
                              </button>
                              {order.players.length > 1 ? (
                                <button type="button" onClick={() => removePlayer(player.id)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!canManageAsTeam ? (
                <div className="uk-review-add-card">
                  <span>
                    <strong>Need another card?</strong>
                    <small>Add another player to this order without starting again.</small>
                  </span>
                  <button type="button" onClick={() => addPlayerToCurrentTeam()}>
                    Add another player
                  </button>
                </div>
              ) : null}
              <div className="uk-review-total">
                <span>Approved prints</span><b>{summary.approvedPrints}</b>
                <span>Total</span><b>{money(summary.subtotal)}</b>
              </div>
              <p className="uk-review-helper">{reviewHelper}</p>
              <button type="button" className="uk-wizard-primary" onClick={handleReviewPrimary} disabled={reviewPrimaryDisabled}>
                {reviewPrimaryLabel}
              </button>
            </section>
          )}

          {activeStep === 4 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Review order</p>
              <h1>{enquiryStatus === 'sent' ? 'Order received.' : 'Review your order.'}</h1>
              <p className="uk-wizard-copy">
                {enquiryStatus === 'sent'
                  ? 'We have your production request and will email you within one business day.'
                  : summary.checkoutEligible
                    ? 'Your cards are ready. We will review your order, confirm print quantity, delivery cost and send you a secure payment link.'
                    : 'Approve at least one card to continue.'}
              </p>
              <div className="uk-production-snapshot">
                <div>
                  <span>Clubs</span>
                  <strong>{approvedGroups.length}</strong>
                </div>
                <div>
                  <span>Players</span>
                  <strong>{summary.approvedPlayers.length}</strong>
                </div>
                <div>
                  <span>Prints</span>
                  <strong>{summary.approvedPrints}</strong>
                </div>
                <div>
                  <span>Estimated</span>
                  <strong>{money(summary.subtotal)}</strong>
                </div>
              </div>
              <div className="uk-order-club-list">
                <h3>Your order</h3>
                {approvedGroups.length > 0 ? (
                  approvedGroups.map((group) => {
                    const prints = group.players.reduce((total, player) => total + player.prints, 0);
                    return (
                      <details key={group.id} className="uk-order-club-row">
                        <summary>
                          <img src={group.badge} alt="" />
                          <span>
                            <strong>{group.name}</strong>
                            <small>{group.players.length} player{group.players.length === 1 ? '' : 's'} &middot; {prints} print{prints === 1 ? '' : 's'}</small>
                          </span>
                          <b>{money(prints * summary.pricing.perCard)}</b>
                        </summary>
                        <div className="uk-order-player-list">
                          {group.players.map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              disabled={!canEditOrder}
                              onClick={() => {
                                setSelectedId(player.id);
                                setActiveStep(2);
                              }}
                            >
                              <span>
                                <strong>{playerLabel(player)}</strong>
                                <small>{selectedTemplate(order, player).name} &middot; #{player.kitNo || '--'} &middot; Qty {player.prints}</small>
                              </span>
                              <b>{money(player.prints * summary.pricing.perCard)}</b>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })
                ) : (
                  <p>Approved cards will appear here grouped by club.</p>
                )}
              </div>
              <div className="uk-order-summary-card">
                <div>
                  <span>Approved cards</span>
                  <strong>{summary.approvedPlayers.length}</strong>
                </div>
                <div>
                  <span>Approved prints</span>
                  <strong>{summary.approvedPrints}</strong>
                </div>
                <div>
                  <span>Estimated total</span>
                  <strong>{money(summary.subtotal)}</strong>
                </div>
              </div>
              <form className="uk-enquiry-form" onSubmit={submitEnquiry}>
                <div className="uk-enquiry-form-head">
                  <h3>Where should we send the order link?</h3>
                  <p>We already have the club and badge for each card. Use this to confirm delivery timing and the payment link.</p>
                </div>
                <label>
                  Name
                  <input
                    value={enquiry.name}
                    autoComplete="name"
                    onChange={(event) => setEnquiry((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Parent or coach name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    value={enquiry.email}
                    type="email"
                    autoComplete="email"
                    onChange={(event) => setEnquiry((current) => ({ ...current, email: event.target.value }))}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  Phone <span>optional</span>
                  <input
                    value={enquiry.phone}
                    type="tel"
                    autoComplete="tel"
                    onChange={(event) => setEnquiry((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Best number for order questions"
                  />
                </label>
                <label className="wide">
                  Anything you would like us to know? <span>optional</span>
                  <textarea
                    value={enquiry.notes}
                    onChange={(event) => setEnquiry((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Extra prints, deadline, delivery instructions, or anything the Emblem team should know."
                    rows={4}
                  />
                </label>
                {enquiryStatus === 'sent' && (
                  <div className="uk-enquiry-success">
                    <strong>Order received.</strong>
                    <span>We will email you within one business day with the final print total, delivery options and secure payment link.</span>
                  </div>
                )}
                {enquiryStatus === 'error' && <p className="uk-enquiry-error">{enquiryError}</p>}
                {enquiryStatus !== 'sent' ? (
                  <button type="submit" className="uk-wizard-primary" disabled={!canSendEnquiry || enquiryStatus === 'sending'}>
                    {enquiryStatus === 'sending' ? 'Sending...' : 'Request production'}
                  </button>
                ) : null}
              </form>
              <div className="uk-next-steps">
                <h3>What happens next?</h3>
                <ol>
                  <li><strong>We review your cards</strong><span>Artwork, badges and print quantities are checked.</span></li>
                  <li><strong>We email a payment link</strong><span>You confirm delivery and pay securely.</span></li>
                  <li><strong>Production begins</strong><span>Your approved cards move into print.</span></li>
                  <li><strong>Cards delivered</strong><span>Your keepsakes arrive ready to share.</span></li>
                </ol>
              </div>
              <div className="uk-handoff-box">
                <h3>Order summary</h3>
                <p>{summary.approvedPlayers.length} cards &middot; {summary.approvedPrints} prints &middot; {money(summary.subtotal)}</p>
                <button type="button" onClick={exportPayload} disabled={!summary.checkoutEligible}>Download summary</button>
                {canEditOrder ? <button type="button" onClick={() => setActiveStep(3)}>Edit order</button> : null}
                <button type="button" onClick={() => setShowPayload((value) => !value)}>{showPayload ? 'Hide technical details' : 'Technical details'}</button>
              </div>
              {showPayload && <pre className="uk-payload">{JSON.stringify(productionPayload(order), null, 2)}</pre>}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SquadUploadQueue({
  order,
  selectedId,
  summary,
  canAdd,
  onSelect,
  onPatch,
  onPhoto,
  onRemove,
  onDuplicate,
  onAdd,
}: {
  order: OrderDraft;
  selectedId: string;
  summary: ReturnType<typeof summarizeOrder>;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
  onPhoto: (id: string, file?: File) => void;
  onRemove: (id: string) => void;
  onDuplicate: (player: PlayerDraft) => void;
  onAdd: () => void;
}) {
  const selectedPlayer = order.players.find((player) => player.id === selectedId) || order.players[0];

  return (
    <div className="uk-squad-upload">
      <div className="uk-squad-summary">
        <span>
          <strong>{order.players.length}</strong>
          players
        </span>
        <span>
          <strong>{summary.counts.ready}</strong>
          ready
        </span>
        <span>
          <strong>{summary.counts['needs-photo']}</strong>
          need photos
        </span>
        <span>
          <strong>{summary.counts['needs-details']}</strong>
          need details
        </span>
      </div>

      {selectedPlayer && (
        <div className="uk-selected-player-card">
          <span className="uk-player-strip-photo">
            {selectedPlayer.photo?.srcUrl ? <img src={selectedPlayer.photo.srcUrl} alt="" /> : <b>No photo</b>}
          </span>
          <div>
            <small>Selected player</small>
            <strong>{playerLabel(selectedPlayer)}</strong>
            <span className={statusClass(derivePlayerStatus(selectedPlayer))}>{statusCopy[derivePlayerStatus(selectedPlayer)]}</span>
          </div>
        </div>
      )}

      <div className="uk-squad-roster" aria-label="Squad player queue">
        {order.players.map((player, index) => {
          const status = derivePlayerStatus(player);
          return (
            <article key={player.id} className={selectedId === player.id ? 'active' : ''}>
              <button type="button" className="uk-squad-roster-photo" onClick={() => onSelect(player.id)} aria-label={`Select ${playerLabel(player, index)}`}>
                {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>No photo</span>}
              </button>
              <div className="uk-squad-roster-fields">
                <label>
                  Name
                  <input value={player.name} placeholder={`Player ${index + 1}`} onChange={(event) => onPatch(player.id, { name: event.target.value })} />
                </label>
                <label>
                  Position
                  <select value={player.position} onChange={(event) => onPatch(player.id, { position: event.target.value })}>
                    <option value="">Select</option>
                    {sportConfig[order.sport].positions.map((position) => <option key={position}>{position}</option>)}
                  </select>
                </label>
                <label>
                  Kit
                  <input value={player.kitNo} onChange={(event) => onPatch(player.id, { kitNo: event.target.value })} />
                </label>
              </div>
              <div className="uk-squad-roster-actions">
                <span className={statusClass(status)}>{statusCopy[status]}</span>
                <label>
                  Photo
                  <input type="file" accept="image/*" hidden onChange={(event) => onPhoto(player.id, event.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => onSelect(player.id)}>Edit</button>
                <button type="button" onClick={() => onDuplicate(player)} disabled={!canAdd}>Copy</button>
                <button type="button" onClick={() => onRemove(player.id)} disabled={order.players.length <= 1}>Remove</button>
              </div>
            </article>
          );
        })}
      </div>

      <button type="button" className="uk-squad-add" onClick={onAdd} disabled={!canAdd}>Add another player</button>
    </div>
  );
}

function PlayerStrip({
  order,
  selectedId,
  onSelect,
}: {
  order: OrderDraft;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="uk-player-strip" aria-label="Choose player to edit">
      {order.players.map((player, index) => {
        const status = derivePlayerStatus(player);
        return (
          <button
            key={player.id}
            type="button"
            className={selectedId === player.id ? 'active' : ''}
            onClick={() => onSelect(player.id)}
          >
            <span className="uk-player-strip-photo">
              {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <b>No photo</b>}
            </span>
            <span>
              <strong>{playerLabel(player, index)}</strong>
              <small>{statusCopy[status]}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TemplatePicker({
  order,
  player,
  onPatch,
}: {
  order: OrderDraft;
  player: PlayerDraft;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
}) {
  const activeTemplateId = selectedTemplate(order, player).id;
  const visibleTemplates = templates.filter((template) =>
    order.collectionType === 'custom'
      ? isCustomCollectionTemplateId(template.id)
      : !isCustomCollectionTemplateId(template.id),
  );

  return (
    <div className="uk-template-picker" aria-label="Card templates">
      <div className="uk-template-picker-head">
        <strong>Card design</strong>
        <span>Pick the frame for this player</span>
      </div>
      <div className="uk-template-picker-grid">
        {visibleTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={activeTemplateId === template.id ? 'active' : ''}
            onClick={() => onPatch(player.id, { templateId: template.id })}
          >
            <span className="uk-template-art" style={{ background: template.background }}>
              {template.frameAsset && <img src={template.frameAsset} alt="" />}
            </span>
            <span>
              <strong>{template.name}</strong>
              <small>{template.description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RosterTable({
  order,
  selectedId,
  onSelect,
  onPatch,
  onPhoto,
  onRemove,
  onDuplicate,
}: {
  order: OrderDraft;
  selectedId: string;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
  onPhoto: (id: string, file?: File) => void;
  onRemove: (id: string) => void;
  onDuplicate: (player: PlayerDraft) => void;
}) {
  return (
    <div className="uk-roster-table">
      {order.players.length === 0 && (
        <div className="uk-empty-state">
          <strong>No players yet</strong>
          <span>Add your first player, or import a squad later.</span>
        </div>
      )}
      {order.players.map((player) => {
        const status = derivePlayerStatus(player);
        return (
          <article key={player.id} className={selectedId === player.id ? 'active' : ''}>
            <button type="button" className="uk-roster-photo" onClick={() => onSelect(player.id)}>
              {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>No photo</span>}
            </button>
            <input aria-label="Player name" value={player.name} placeholder="Player name" onChange={(event) => onPatch(player.id, { name: event.target.value })} />
            <input aria-label="Position" value={player.position} placeholder="Position" onChange={(event) => onPatch(player.id, { position: event.target.value })} />
            <input aria-label="Kit number" value={player.kitNo} placeholder="Kit" onChange={(event) => onPatch(player.id, { kitNo: event.target.value })} />
            <span className={statusClass(status)}>{statusCopy[status]}</span>
            <label className="uk-mini-upload">
              Photo
              <input type="file" accept="image/*" hidden onChange={(event) => onPhoto(player.id, event.target.files?.[0])} />
            </label>
            <button type="button" onClick={() => onSelect(player.id)}>Edit</button>
            <button type="button" onClick={() => onDuplicate(player)}>Duplicate</button>
            <button type="button" onClick={() => onRemove(player.id)}>Remove</button>
          </article>
        );
      })}
    </div>
  );
}

function PlayerEditor({
  order,
  player,
  onPatch,
  onPhoto,
  onClub,
  onBadge,
}: {
  order: OrderDraft;
  player: PlayerDraft;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
  onPhoto: (id: string, file?: File) => void;
  onClub: (playerId: string, clubId: string) => void;
  onBadge: (playerId: string, file?: File) => void;
}) {
  const status = derivePlayerStatus(player);
  const stats = sportConfig[order.sport].stats;
  const isCustomCollection = order.collectionType === 'custom';

  return (
    <div className="uk-player-editor">
      <div className="uk-editor-head">
        <span className={statusClass(status)}>{statusCopy[status]}</span>
        <strong>{playerLabel(player)}</strong>
      </div>
      <label className="uk-upload-large">
        {player.photo ? 'Replace photo' : 'Upload photo'}
        <input type="file" accept="image/*" hidden onChange={(event) => onPhoto(player.id, event.target.files?.[0])} />
      </label>
      <div className="uk-editor-badge-picker">
        <div className="uk-editor-badge-head">
          <span>
            <strong>Club badge</strong>
            <small>
              {isCustomCollection
                ? 'Shown as the badge for this custom collection.'
                : 'Shown with the East Manchester league crest on the card.'}
            </small>
          </span>
          <img src={playerBadge(order, player)} alt="" />
        </div>
        {isCustomCollection ? (
          <div className="uk-editor-badge-row single">
            <label>
              Upload custom badge
              <input type="file" accept="image/*" hidden onChange={(event) => onBadge(player.id, event.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <>
            <div className="uk-editor-badge-row">
              <select
                value={playerClubId(order, player)}
                onChange={(event) => onClub(player.id, event.target.value)}
              >
                {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
              <label>
                Upload badge
                <input type="file" accept="image/*" hidden onChange={(event) => onBadge(player.id, event.target.files?.[0])} />
              </label>
            </div>
            <div className="uk-editor-badge-strip" aria-label="Choose club badge while editing">
              {EMJFL_CLUBS.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  className={playerClubId(order, player) === club.id ? 'active' : ''}
                  onClick={() => onClub(player.id, club.id)}
                  title={club.name}
                >
                  <img src={club.badgePath} alt="" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="uk-field-stack">
        <label>
          Name
          <input value={player.name} onChange={(event) => onPatch(player.id, { name: event.target.value })} />
        </label>
        <label>
          Position
          <select value={player.position} onChange={(event) => onPatch(player.id, { position: event.target.value })}>
            <option value="">Select</option>
            {sportConfig[order.sport].positions.map((position) => <option key={position}>{position}</option>)}
          </select>
        </label>
        <label>
          Kit number
          <input value={player.kitNo} onChange={(event) => onPatch(player.id, { kitNo: event.target.value })} />
        </label>
        <label>
          Prints
          <input
            type="number"
            min={1}
            max={50}
            value={player.prints}
            onChange={(event) => onPatch(player.id, { prints: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
      </div>
      <div className="uk-stat-grid">
        {stats.map((stat) => (
          <label key={stat.key}>
            {stat.label}
            <input
              value={player.stats[stat.key] || ''}
              onChange={(event) => onPatch(player.id, { stats: { ...player.stats, [stat.key]: event.target.value } })}
            />
          </label>
        ))}
      </div>
      {player.approvedAt && <p className="uk-approval-note">Approved cards are locked. Any edit asks for confirmation and returns the card to review.</p>}
    </div>
  );
}

function PlayerCard({
  order,
  player,
  compact = false,
  side = 'front',
}: {
  order: OrderDraft;
  player: PlayerDraft;
  compact?: boolean;
  side?: CardSide;
}) {
  const template = selectedTemplate(order, player);
  const stats = sportConfig[order.sport].stats;
  const useRealBuilderArt =
    (order.collectionType === 'official' && (template.id === 'emjfl-official' || isHollinwoodTemplateId(template.id))) ||
    (order.collectionType === 'custom' && isCustomCollectionTemplateId(template.id));

  if (useRealBuilderArt) {
    return (
      <div className={`uk-real-card ${compact ? 'compact' : ''}`}>
        <CardArt
          template={cardArtTemplate(template.id)}
          photo={player.photo?.srcUrl || null}
          details={{
            name: player.name || 'Player 1',
            number: player.kitNo || '--',
            team: playerClubName(order, player) || 'Club Name',
            position: player.position || 'Position',
          }}
          logo={playerBadge(order, player)}
          stats={player.stats}
          sport="soccer"
          side={side}
          size={compact ? 170 : 340}
          photoScale={player.photo?.crop.scale || 1}
          photoOffsetX={player.photo?.crop.x || 0}
          photoOffsetY={player.photo?.crop.y || 0}
        />
      </div>
    );
  }

  if (side === 'back') {
    return (
      <div className={`uk-player-card back ${compact ? 'compact' : ''}`} style={{ background: template.background }}>
        {order.collectionType === 'official' && template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
        <div className="uk-back-top">
          <div className="uk-back-logo">{playerBadge(order, player) ? <img src={playerBadge(order, player)} alt="" /> : <span>Club<br />logo</span>}</div>
          <div>
            <small>Emblem UK football card</small>
            <h3>{playerClubName(order, player) || 'Club name'}</h3>
            <p>{order.ageGroup || 'Age group'} / {order.season}</p>
          </div>
        </div>
        <div className="uk-back-player">
          <span>#{player.kitNo || '00'}</span>
          <h3>{player.name || 'PLAYER 1'}</h3>
          <p>{player.position || 'Position'} / {order.league || 'Grassroots football'}</p>
        </div>
        <div className="uk-back-stats">
          {stats.map((stat) => (
            <span key={stat.key}>
              <strong>{player.stats[stat.key] || '-'}</strong>
              {stat.label}
            </span>
          ))}
        </div>
        <div className="uk-back-memory">
          <strong>Digital profile</strong>
          <span>Season stats, highlights, photos and memories attached to this keepsake.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`uk-player-card front ${compact ? 'compact' : ''}`} style={{ background: template.background }}>
      {order.collectionType === 'official' && template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
      <div className="uk-card-logo">{playerBadge(order, player) ? <img src={playerBadge(order, player)} alt="" /> : <span>Logo</span>}</div>
      <div className="uk-card-photo">
        {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>Photo</span>}
      </div>
      <div className="uk-card-kit">{player.kitNo || '00'}</div>
      <div className="uk-card-band">
        <h3>{player.name || 'PLAYER 1'}</h3>
        <p>{playerClubName(order, player) || 'Club name'} / {player.position || 'Position'}</p>
      </div>
      <div className="uk-card-stats">
        {stats.map((stat) => (
          <span key={stat.key}>
            <strong>{player.stats[stat.key] || '-'}</strong>
            {stat.label}
          </span>
        ))}
      </div>
      <small>EMBLEM UK / {order.season}</small>
    </div>
  );
}
