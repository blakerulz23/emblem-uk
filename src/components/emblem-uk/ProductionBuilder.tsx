'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CardArt from '@/components/builder/emblem/CardArt';
import { CARD_TEMPLATES } from '@/components/builder/emblem/data';
import { DEFAULT_EMJFL_CLUB, EAST_MANCHESTER_LEAGUE, EMJFL_CLUBS, getEmjflClub, preferredTemplateForClub } from '@/lib/emjfl-clubs';
import { isHollinwoodTemplateId } from '@/lib/hollinwood-manifest';
import {
  createPlayer,
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

const orderModeLimits: Record<OrderType, { maxPlayers: number; rosterCopy: string }> = {
  single: { maxPlayers: 1, rosterCopy: 'Single orders are capped at one approved card.' },
  set: { maxPlayers: 6, rosterCopy: 'Sets are built for two to six cards in one session.' },
  squad: { maxPlayers: 40, rosterCopy: 'Squad orders support bulk photo upload and team-level approval.' },
};

const steps = ['Choose club', 'Upload photos', 'Choose design', 'Complete cards', 'Approve cards', 'Request production'];
type CardSide = 'front' | 'back';
type EnquiryStatus = 'idle' | 'sending' | 'sent' | 'error';

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function statusClass(status: string) {
  return `builder-status builder-status-${status}`;
}

const emjflTemplate = CARD_TEMPLATES.find((template) => template.id === 'emjfl-official') || CARD_TEMPLATES[0];
const cardArtTemplatesById = new Map(CARD_TEMPLATES.map((template) => [template.id, template]));

function emjflClubLogo(order: OrderDraft) {
  return order.badgeUrl || getEmjflClub(order.emjflClubId).badgePath;
}

function cardArtTemplate(templateId: TemplateId) {
  return cardArtTemplatesById.get(templateId) || emjflTemplate;
}

function canAddPlayer(order: OrderDraft) {
  return order.players.length < orderModeLimits[order.type].maxPlayers;
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
    team: '',
    notes: '',
  });

  const selectedPlayer = order.players.find((player) => player.id === selectedId) || order.players[0];
  const summary = useMemo(() => summarizeOrder(order), [order]);
  const stats = sportConfig[order.sport].stats;
  const orderMode = orderModeLimits[order.type];
  const visibleOrderType = order.type === 'single' ? 'single' : 'squad';
  const addDisabled = !canAddPlayer(order);
  const hasAnyPhoto = order.players.some((player) => Boolean(player.photo?.srcUrl));
  const selectedHasPhoto = Boolean(selectedPlayer?.photo?.srcUrl);
  const canSendEnquiry = summary.checkoutEligible && enquiry.name.trim().length > 1 && /\S+@\S+\.\S+/.test(enquiry.email);

  const patchOrder = (patch: Partial<OrderDraft>) => {
    setOrder((current) => ({ ...current, ...patch }));
  };

  const selectClub = (clubId: string) => {
    const club = getEmjflClub(clubId);
    const preferredTemplate = preferredTemplateForClub(clubId) as TemplateId;
    setOrder((current) => ({
      ...current,
      emjflClubId: club.id,
      club: club.name,
      league: EAST_MANCHESTER_LEAGUE,
      badgeUrl: undefined,
      templateDefault: preferredTemplate,
      players: current.players.map((player) => ({
        ...player,
        templateId: player.templateId ? preferredTemplate : player.templateId,
        updatedAt: nowIso(),
      })),
    }));
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

  const addPlayer = (seed?: Partial<PlayerDraft>) => {
    if (!canAddPlayer(order)) return;
    const player = createPlayer({
      stats: Object.fromEntries(stats.map((stat) => [stat.key, ''])),
      templateId: order.templateDefault,
      ...seed,
    });
    setOrder((current) => ({ ...current, players: [...current.players, player] }));
    setSelectedId(player.id);
    setActiveStep(1);
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

  const assignBadge = (file?: File) => {
    if (!file) return;
    patchOrder({ badgeUrl: URL.createObjectURL(file) });
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
      const response = await fetch('/api/order-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: enquiry,
          submittedAt: nowIso(),
          ...productionPayload(order),
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
  const completeCount = summary.counts.ready + summary.counts.approved;
  const progressLabel = summary.checkoutEligible ? 'Order summary' : `${completeCount}/${order.players.length} ready`;
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
    setActiveStep(3);
  };
  const orderedTemplates = useMemo(() => {
    const preferred = preferredTemplateForClub(order.emjflClubId);
    return [...templates].sort((a, b) => {
      if (a.id === preferred) return -1;
      if (b.id === preferred) return 1;
      return 0;
    });
  }, [order.emjflClubId]);

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
              onClick={() => setActiveStep(summary.checkoutEligible ? 5 : 4)}
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
              <p className="uk-wizard-kicker">Choose your club</p>
              <h1>Who are you building for?</h1>
              <p className="uk-wizard-copy">One card for your child, or a matching set for the whole team.</p>
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
              <div className="uk-wizard-fields">
                <label>
                  Season
                  <input value={order.season} onChange={(event) => patchOrder({ season: event.target.value })} />
                </label>
                <label>
                  League
                  <input value={order.league || EAST_MANCHESTER_LEAGUE} readOnly />
                </label>
                <div className="uk-wizard-club-row">
                  <label>
                    Club / team
                    <select
                      value={order.emjflClubId || DEFAULT_EMJFL_CLUB.id}
                      onChange={(event) => selectClub(event.target.value)}
                    >
                      {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                    </select>
                  </label>
                  <img src={emjflClubLogo(order)} alt="" />
                </div>
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
                    <span>▧</span>
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
                    <span>▧</span>
                    <strong>Upload player photos</strong>
                    <small>Select one photo, or choose several at once.</small>
                    <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                  </label>
                  <button type="button" className="uk-upload-card" onClick={() => addPlayer()} disabled={addDisabled}>
                    <span>＋</span>
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
                    <span>▧</span>
                    <strong>{selectedPlayer.photo ? 'Replace photo' : 'Upload a photo'}</strong>
                    <small>{selectedPlayer.photo?.fileName || 'Pick one from your files.'}</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                )}
                <label className="uk-upload-card">
                  <span>＋</span>
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
                <button type="button" className="uk-wizard-primary compact" onClick={() => setActiveStep(2)} disabled={!hasAnyPhoto}>Choose style</button>
              </div>
            </section>
          )}

          {activeStep === 2 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Choose design</p>
              <h1>Choose your style.</h1>
              <p className="uk-wizard-copy">Real UK football templates. Swipe the cards, then tap one to customise.</p>
              <div className="uk-style-carousel">
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
                    {template.id === preferredTemplateForClub(order.emjflClubId) && <small>Recommended for {getEmjflClub(order.emjflClubId).name}</small>}
                  </button>
                ))}
              </div>
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStep(3)}>Customise this design</button>
            </section>
          )}

          {activeStep === 3 && selectedPlayer && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Complete cards</p>
              <h1>Make it theirs.</h1>
              <p className="uk-wizard-copy">Edit the details. The preview updates live.</p>
              {order.type !== 'single' && (
                <div className="uk-squad-edit-bar">
                  <button type="button" onClick={() => selectAdjacentPlayer(-1)} disabled={selectedIndex <= 0}>Previous</button>
                  <span>{selectedIndex + 1} of {order.players.length}</span>
                  <button type="button" onClick={() => selectAdjacentPlayer(1)} disabled={selectedIndex >= order.players.length - 1}>Next</button>
                </div>
              )}
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
              <PlayerEditor order={order} player={selectedPlayer} onPatch={patchPlayer} onPhoto={assignPhoto} onClub={selectClub} onBadge={assignBadge} />
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStep(4)}>Review order</button>
            </section>
          )}

          {activeStep === 4 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Approve cards</p>
              <h1>Ready for production?</h1>
              <p className="uk-wizard-copy">Complete each card, then approve the ones you want printed.</p>
              <div className="uk-review-list">
                {order.players.map((player, index) => {
                  const status = derivePlayerStatus(player);
                  const missing = missingItems(player);
                  const score = completionScore(player);
                  return (
                    <article key={player.id}>
                      <PlayerCard order={order} player={player} compact />
                      <div>
                        <h3>{playerLabel(player, index)}</h3>
                        <p>{selectedTemplate(order, player).name} &middot; #{player.kitNo || '--'} &middot; Qty {player.prints}</p>
                        <span className={statusClass(status)}>{statusCopy[status]}</span>
                        <div className="uk-completion-meter" aria-label={`${score}% complete`}>
                          <span style={{ width: `${score}%` }} />
                        </div>
                        <small>{score}% complete</small>
                        {missing.length > 0 && <em>Missing {missing.join(', ')}</em>}
                      </div>
                      {status === 'ready' ? (
                        <button type="button" onClick={() => approvePlayer(player.id)}>Approve</button>
                      ) : status === 'approved' ? (
                        <button type="button" className="approved" onClick={() => setActiveStep(5)}>Ready</button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(player.id);
                            setActiveStep(3);
                          }}
                        >
                          {reviewActionCopy(player)}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="uk-review-total">
                <span>Approved prints</span><b>{summary.approvedPrints}</b>
                <span>Total</span><b>{money(summary.subtotal)}</b>
              </div>
              <button type="button" onClick={approveAllReady} disabled={summary.counts.ready === 0}>Approve all ready</button>
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStep(5)}>Create order summary</button>
            </section>
          )}

          {activeStep === 5 && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Request production</p>
              <h1>Ready to send.</h1>
              <p className="uk-wizard-copy">{summary.checkoutEligible ? 'Send the approved cards to Emblem and we will come back with the print order and checkout link.' : 'Approve at least one card to continue.'}</p>
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
                  <p>We will use this to confirm the cards, print quantity, delivery timing and payment link.</p>
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
                <label>
                  Club / team
                  <input
                    value={enquiry.team}
                    onChange={(event) => setEnquiry((current) => ({ ...current, team: event.target.value }))}
                    placeholder={order.club || getEmjflClub(order.emjflClubId).name}
                  />
                </label>
                <label className="wide">
                  Notes <span>optional</span>
                  <textarea
                    value={enquiry.notes}
                    onChange={(event) => setEnquiry((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Deadline, delivery notes, extra prints, or anything the Emblem team should know."
                    rows={4}
                  />
                </label>
                {enquiryStatus === 'sent' && (
                  <div className="uk-enquiry-success">
                    <strong>Enquiry sent.</strong>
                    <span>We have captured the order summary. Download a copy below for your records.</span>
                  </div>
                )}
                {enquiryStatus === 'error' && <p className="uk-enquiry-error">{enquiryError}</p>}
                <button type="submit" className="uk-wizard-primary" disabled={!canSendEnquiry || enquiryStatus === 'sending'}>
                  {enquiryStatus === 'sending' ? 'Sending...' : 'Send order enquiry'}
                </button>
              </form>
              <div className="uk-handoff-box">
                <h3>Keep a copy</h3>
                <p>{summary.approvedPlayers.length} approved players &middot; {summary.pricing.label}</p>
                <button type="button" onClick={exportPayload} disabled={!summary.checkoutEligible}>Download order summary</button>
                <button type="button" onClick={() => setShowPayload((value) => !value)}>{showPayload ? 'Hide technical details' : 'Show technical details'}</button>
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

  return (
    <div className="uk-template-picker" aria-label="Card templates">
      <div className="uk-template-picker-head">
        <strong>Card design</strong>
        <span>Pick the frame for this player</span>
      </div>
      <div className="uk-template-picker-grid">
        {templates.map((template) => (
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
  onClub: (clubId: string) => void;
  onBadge: (file?: File) => void;
}) {
  const status = derivePlayerStatus(player);
  const stats = sportConfig[order.sport].stats;

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
            <small>Shown with the East Manchester league crest on the card.</small>
          </span>
          <img src={emjflClubLogo(order)} alt="" />
        </div>
        <div className="uk-editor-badge-row">
          <select
            value={order.emjflClubId || DEFAULT_EMJFL_CLUB.id}
            onChange={(event) => onClub(event.target.value)}
          >
            {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
          <label>
            Upload badge
            <input type="file" accept="image/*" hidden onChange={(event) => onBadge(event.target.files?.[0])} />
          </label>
        </div>
        <div className="uk-editor-badge-strip" aria-label="Choose club badge while editing">
          {EMJFL_CLUBS.map((club) => (
            <button
              key={club.id}
              type="button"
              className={(order.emjflClubId || DEFAULT_EMJFL_CLUB.id) === club.id ? 'active' : ''}
              onClick={() => onClub(club.id)}
              title={club.name}
            >
              <img src={club.badgePath} alt="" />
            </button>
          ))}
        </div>
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

  if (template.id === 'emjfl-official' || isHollinwoodTemplateId(template.id)) {
    return (
      <div className={`uk-real-card ${compact ? 'compact' : ''}`}>
        <CardArt
          template={cardArtTemplate(template.id)}
          photo={player.photo?.srcUrl || null}
          details={{
            name: player.name || 'Player 1',
            number: player.kitNo || '--',
            team: order.club || getEmjflClub(order.emjflClubId).name || 'Club Name',
            position: player.position || 'Position',
          }}
          logo={template.id === 'emjfl-official' || isHollinwoodTemplateId(template.id) ? emjflClubLogo(order) : null}
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
        {template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
        <div className="uk-back-top">
          <div className="uk-back-logo">{order.badgeUrl ? <img src={order.badgeUrl} alt="" /> : <span>Club<br />logo</span>}</div>
          <div>
            <small>Emblem UK football card</small>
            <h3>{order.club || 'Club name'}</h3>
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
      {template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
      <div className="uk-card-logo">{order.badgeUrl ? <img src={order.badgeUrl} alt="" /> : <span>Logo</span>}</div>
      <div className="uk-card-photo">
        {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>Photo</span>}
      </div>
      <div className="uk-card-kit">{player.kitNo || '00'}</div>
      <div className="uk-card-band">
        <h3>{player.name || 'PLAYER 1'}</h3>
        <p>{order.club || 'Club name'} / {player.position || 'Position'}</p>
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
