'use client';

import { computeAutoFitCrop } from '@/lib/photo-geometry';
import { detectSubjectBounds, loadNaturalSize } from '@/lib/subject-bounds';
import type { CropTransform } from '@/lib/emblem-uk-builder';

/**
 * The one photo-well size/position every football card family in this
 * builder (EMJFL, Hollinwood, Custom Collection) actually renders at —
 * confirmed against CardArt.tsx's own computePhotoGeometry calls, all of
 * which pass 'center 12%' and a 340x476 box. Shared here so Auto-fit Player
 * (this module) and the card renderer agree on what "fits" means without
 * either one guessing at the other's numbers.
 */
export const CARD_PHOTO_BOX = { boxWidth: 340, boxHeight: 476 };
export const CARD_PHOTO_OBJECT_POSITION = 'center 12%';

export type AutoFitPhotoPatch = {
  naturalWidth: number;
  naturalHeight: number;
  subjectBounds?: { x0: number; y0: number; x1: number; y1: number };
  crop: CropTransform;
  suggestedCrop: CropTransform;
};

/**
 * Measures a photo (natural size +, when the pixels are readable, its alpha
 * bounding box) and computes the Auto-fit crop for it — the one function
 * both the automatic "first framing after upload" pass (BackgroundRemoval-
 * Step.tsx) and the manual "Auto-fit player" button (ProductionBuilder.tsx)
 * call, so they can never compute two different answers for the same photo.
 * Returns null if the photo can't even be measured (decode failure) —
 * callers should leave the existing crop alone in that case rather than
 * overwrite it with a guess.
 */
export async function autoFitPatchForPhoto(src: string): Promise<AutoFitPhotoPatch | null> {
  const natural = await loadNaturalSize(src);
  if (!natural) return null;
  const subjectBounds = await detectSubjectBounds(src);
  const crop = computeAutoFitCrop({
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    ...CARD_PHOTO_BOX,
    objectPosition: CARD_PHOTO_OBJECT_POSITION,
    subjectBounds,
  });
  return {
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    subjectBounds: subjectBounds ?? undefined,
    crop,
    suggestedCrop: crop,
  };
}
