'use client';

import { useEffect, useState } from 'react';
import type { OrderDraft } from '@/lib/emblem-uk-builder';
import {
  COACH_CARD_ROLE_PRESETS,
  coachCardDesignInheritance,
  isCoachCardDraftComplete,
  validateCoachCardDraft,
  type CoachCardDraft,
  type CoachCardRolePreset,
  type CoachCardTeamOption,
} from '@/lib/coach-card-draft';

const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_PHOTO_BYTES = 18 * 1024 * 1024;

interface CoachCardSectionProps {
  order: OrderDraft;
  eligible: boolean;
  draft: CoachCardDraft;
  options: CoachCardTeamOption[];
  onChange: (patch: Partial<CoachCardDraft>) => void;
  onSelectTeam: (option: CoachCardTeamOption) => void;
}

/**
 * Stage 5B — sits in the Review step, right after the existing "Free coach
 * card unlocked" teaser in PricingSummaryCard. Fully hidden when `eligible`
 * is false (not squad, or the quote is loading/stale/error) — see
 * evaluateCoachCardEligibility in coach-card-draft.ts, the only thing this
 * component takes eligibility instructions from. `draft` lives in
 * ProductionBuilder's own state and is never cleared just because this
 * section is hidden, so a customer's in-progress details survive a
 * temporary quote retry.
 */
export default function CoachCardSection({ order, eligible, draft, options, onChange, onSelectTeam }: CoachCardSectionProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [roleSelection, setRoleSelection] = useState<CoachCardRolePreset | ''>(() => {
    if (!draft.roleTitle) return '';
    return (COACH_CARD_ROLE_PRESETS as readonly string[]).includes(draft.roleTitle) ? (draft.roleTitle as CoachCardRolePreset) : 'Other';
  });

  // Revoke the previous object URL whenever the photo changes or this
  // section unmounts — the only new memory-leak guard added in Stage 5B;
  // the existing player-photo flow is left exactly as-is.
  useEffect(() => {
    const srcUrl = draft.photo?.srcUrl;
    return () => {
      if (srcUrl?.startsWith('blob:')) URL.revokeObjectURL(srcUrl);
    };
  }, [draft.photo?.srcUrl]);

  if (!eligible) return null;

  const errors = validateCoachCardDraft(draft, options);
  const complete = isCoachCardDraftComplete(draft, options);
  const showForm = !confirmed || !complete;
  const design = coachCardDesignInheritance(order, draft.teamOptionId);

  const handlePhotoFile = (file?: File) => {
    if (!file) return;
    setPhotoError('');
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      setPhotoError('Use a JPEG, PNG, WEBP or HEIC photo.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo must be under 18MB.');
      return;
    }
    // A fresh id here (only here — never regenerated on submit/retry)
    // is what lets ProductionBuilder.tsx upload this exact photo at most
    // once per submission attempt: replacing the photo is the only thing
    // that should ever change which S3 key it ends up at.
    onChange({ photo: { id: crypto.randomUUID(), file, srcUrl: URL.createObjectURL(file), fileName: file.name } });
  };

  const handleRemovePhoto = () => {
    onChange({ photo: null });
  };

  const handleRoleSelect = (value: CoachCardRolePreset | '') => {
    setRoleSelection(value);
    if (value === '' || value === 'Other') {
      onChange({ roleTitle: '' });
    } else {
      onChange({ roleTitle: value });
    }
  };

  const handleSave = () => {
    setTouched(true);
    if (complete) setConfirmed(true);
  };

  if (showForm) {
    return (
      <div className="uk-coach-card-section">
        <div className="uk-coach-card-head">
          <h3>Your free coach card</h3>
          <p>Your full-squad order includes one coach card at no extra cost. Add the coach&apos;s details below so we can prepare it with the rest of the team.</p>
        </div>

        <label className="uk-coach-card-field">
          Coach name
          <input
            value={draft.fullName}
            onChange={(event) => onChange({ fullName: event.target.value })}
            onBlur={() => setTouched(true)}
            placeholder="Coach's full name"
            aria-invalid={touched && Boolean(errors.fullName)}
            aria-describedby={touched && errors.fullName ? 'uk-coach-card-name-error' : undefined}
          />
          {touched && errors.fullName && (
            <span id="uk-coach-card-name-error" role="alert" className="uk-coach-card-error">
              {errors.fullName}
            </span>
          )}
        </label>

        <label className="uk-coach-card-field">
          Role / title
          <select
            value={roleSelection}
            onChange={(event) => handleRoleSelect(event.target.value as CoachCardRolePreset | '')}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && Boolean(errors.roleTitle)}
            aria-describedby={touched && errors.roleTitle ? 'uk-coach-card-role-error' : undefined}
          >
            <option value="">Select a role</option>
            {COACH_CARD_ROLE_PRESETS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        {roleSelection === 'Other' && (
          <label className="uk-coach-card-field">
            Custom role
            <input
              value={draft.roleTitle}
              onChange={(event) => onChange({ roleTitle: event.target.value })}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Kit Manager"
              aria-invalid={touched && Boolean(errors.roleTitle)}
              aria-describedby={touched && errors.roleTitle ? 'uk-coach-card-role-error' : undefined}
            />
          </label>
        )}
        {touched && errors.roleTitle && (
          <span id="uk-coach-card-role-error" role="alert" className="uk-coach-card-error">
            {errors.roleTitle}
          </span>
        )}

        <div className="uk-coach-card-field">
          <span>Club / team</span>
          {options.length <= 1 ? (
            <div className="uk-coach-card-team-preselected">
              {draft.clubName ? (
                <strong>{draft.clubName}</strong>
              ) : (
                <em>Approve at least one card to choose a club/team.</em>
              )}
            </div>
          ) : (
            <select
              value={draft.teamOptionId ?? ''}
              onChange={(event) => {
                const option = options.find((item) => item.id === event.target.value);
                if (option) onSelectTeam(option);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && Boolean(errors.team)}
              aria-describedby={touched && errors.team ? 'uk-coach-card-team-error' : undefined}
            >
              <option value="">Select which club/team</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.clubName}
                </option>
              ))}
            </select>
          )}
          {touched && errors.team && (
            <span id="uk-coach-card-team-error" role="alert" className="uk-coach-card-error">
              {errors.team}
            </span>
          )}
        </div>

        {draft.teamOptionId && (
          <p className="uk-coach-card-design-note">
            {design.matchesTeam
              ? `Your coach card will use the ${design.templateName} design, matching ${draft.teamName}'s cards.`
              : `Your coach card will use the ${design.templateName} design.`}
          </p>
        )}

        <div className="uk-coach-card-field">
          <span>Coach photo</span>
          {draft.photo ? (
            <div className="uk-coach-card-photo-preview">
              <img src={draft.photo.srcUrl} alt="" />
              <div className="uk-coach-card-photo-actions">
                <label>
                  Replace
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => handlePhotoFile(event.target.files?.[0])} />
                </label>
                <button type="button" onClick={handleRemovePhoto}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="uk-coach-card-photo-upload">
              <span aria-hidden="true">+</span>
              <strong>Upload coach photo</strong>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => handlePhotoFile(event.target.files?.[0])} />
            </label>
          )}
          {photoError && (
            <span role="alert" className="uk-coach-card-error">
              {photoError}
            </span>
          )}
          {touched && !photoError && errors.photo && (
            <span role="alert" className="uk-coach-card-error">
              {errors.photo}
            </span>
          )}
        </div>

        <button type="button" className="uk-wizard-primary compact" onClick={handleSave} disabled={!complete}>
          Confirm coach card details
        </button>
      </div>
    );
  }

  return (
    <div className="uk-coach-card-section uk-coach-card-summary">
      <div className="uk-coach-card-summary-head">
        <strong>Free coach card</strong>
        <span>Quantity 1</span>
        <span>£0.00</span>
      </div>
      <div className="uk-coach-card-summary-body">
        {draft.photo && (
          <span className="uk-coach-card-summary-photo">
            <img src={draft.photo.srcUrl} alt="" />
          </span>
        )}
        <div>
          <strong>{draft.fullName}</strong>
          <span>{draft.roleTitle}</span>
          <span>{draft.clubName}</span>
        </div>
      </div>
      <button type="button" onClick={() => setConfirmed(false)}>
        Edit
      </button>
    </div>
  );
}
