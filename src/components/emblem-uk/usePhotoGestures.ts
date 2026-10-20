'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CropTransform, PhotoAsset } from '@/lib/emblem-uk-builder';
import {
  inferObjectPosition,
  panPhoto,
  touchDistance,
  wheelZoomFactor,
  zoomPhotoBy,
  type PhotoFrameModel,
} from '@/lib/photo-gestures';

/**
 * Move and zoom the photo on the card itself (adapted from Emblem Canada's
 * builder): drag with a mouse or one finger, pinch with two, scroll-wheel or
 * the +/- buttons to zoom, arrow keys and +/- when the card has focus,
 * double-click to go back to the suggested framing.
 *
 * Native listeners rather than React props, because wheel and touchmove are
 * passive by default, and a pinch that can't preventDefault zooms the page
 * instead of the photo.
 *
 * Every gesture writes the same photo.crop the sliders write, through the
 * caller's own patch function, so drafts, team-card switching, approval and
 * print all carry on exactly as they did. The card renderer and print
 * capture are not touched.
 */

type GestureContext = {
  enabled: boolean;
  photo: PhotoAsset | undefined;
  apply: (crop: CropTransform) => void;
  onInteract: () => void;
  onBlocked: () => void;
};

/** Find the rendered photo in a frame and describe it for photo-gestures.ts, or null where this design doesn't position a photo. */
function readFrame(frame: HTMLElement, photo: PhotoAsset): { model: PhotoFrameModel; rect: DOMRect } | null {
  const img = Array.from(frame.querySelectorAll('img')).find((el) => el.getAttribute('src') === photo.srcUrl);
  if (!img) return null;
  const box = (img.closest('[data-capture-clip-wrapper]') as HTMLElement | null) ?? img.parentElement;
  if (!box || !box.offsetWidth || !box.offsetHeight) return null;
  const rect = box.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const natural = photo.naturalWidth && photo.naturalHeight ? { naturalWidth: photo.naturalWidth, naturalHeight: photo.naturalHeight } : null;
  const style = getComputedStyle(img);
  const objectPosition = inferObjectPosition({
    crop: photo.crop,
    boxWidth: box.offsetWidth,
    boxHeight: box.offsetHeight,
    natural,
    computed: { transform: style.transform, objectPosition: style.objectPosition, left: style.left, top: style.top },
  });
  return { model: { boxWidth: box.offsetWidth, boxHeight: box.offsetHeight, objectPosition, natural }, rect };
}

export function usePhotoGestures({
  frames,
  enabled,
  photo,
  onChange,
  onInteract,
  onBlocked,
}: {
  /** The card elements to listen on (callback-ref state, so a preview that mounts later is picked up). */
  frames: Array<HTMLElement | null>;
  enabled: boolean;
  photo: PhotoAsset | undefined;
  onChange: (crop: CropTransform) => void;
  onInteract?: () => void;
  /** A drag that could not move the photo (it already shows the whole photo on that axis). */
  onBlocked?: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  // One crop update per animation frame, however many pointer events arrive.
  const pending = useRef<CropTransform | null>(null);
  const raf = useRef<number | null>(null);
  const flush = useCallback(() => {
    raf.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) ctx.current.apply(next);
  }, []);
  const schedule = useCallback((crop: CropTransform) => {
    pending.current = crop;
    if (raf.current === null) raf.current = requestAnimationFrame(flush);
  }, [flush]);

  const ctx = useRef<GestureContext>({ enabled: false, photo: undefined, apply: () => {}, onInteract: () => {}, onBlocked: () => {} });
  // Written during render so listeners bound once always act on the card on
  // screen now (a different team card, a new photo), never a stale one.
  ctx.current = {
    enabled: enabled && Boolean(photo?.srcUrl),
    photo,
    apply: onChange,
    onInteract: onInteract ?? (() => {}),
    onBlocked: onBlocked ?? (() => {}),
  };

  /** The crop to build on: a gesture's own pending value if one hasn't painted yet, else the saved one. */
  const liveCrop = () => pending.current ?? ctx.current.photo?.crop ?? { x: 0, y: 0, scale: 1 };

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const frame of frames) {
      if (!frame) continue;

      // A gesture measures from where it started and carries its own copy
      // of the starting crop, so quick moves can't compound rounding or read
      // a crop React hasn't re-rendered yet.
      let drag: { id: number; x: number; y: number; crop: CropTransform; model: PhotoFrameModel; rect: DOMRect; travel: number } | null = null;
      let pinch: { distance: number; crop: CropTransform; model: PhotoFrameModel } | null = null;

      /**
       * The card under this point, or null. Only the card itself takes
       * gestures: the preview row is wider than the card on a tablet, and a
       * touch beside the card must scroll the page as usual.
       */
      const begin = (point?: { x: number; y: number }) => {
        const photoNow = ctx.current.photo;
        if (!ctx.current.enabled || !photoNow) return null;
        const read = readFrame(frame, { ...photoNow, crop: liveCrop() });
        if (!read) return null;
        if (point) {
          const r = read.rect;
          if (point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom) return null;
        }
        return read;
      };

      /**
       * A drag that went somewhere but left the photo where it was: the
       * renderer never offsets an axis that already shows the whole photo
       * (Auto-fit's framing usually does), so say how to get room to move.
       */
      const finishDrag = () => {
        if (!drag) return;
        const now = liveCrop();
        if (drag.travel > 16 && now.x === drag.crop.x && now.y === drag.crop.y) ctx.current.onBlocked();
        drag = null;
        setDragging(false);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
        const read = begin({ x: event.clientX, y: event.clientY });
        if (!read) return;
        ctx.current.onInteract();
        event.preventDefault(); // no text selection or native image drag
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, crop: liveCrop(), travel: 0, ...read };
        frame.setPointerCapture(event.pointerId);
        setDragging(true);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        drag.travel = Math.max(drag.travel, Math.hypot(event.clientX - drag.x, event.clientY - drag.y));
        schedule(panPhoto(drag.crop, drag.model, { fx: (event.clientX - drag.x) / drag.rect.width, fy: (event.clientY - drag.y) / drag.rect.height }));
      };
      const endPointer = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        try { frame.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        finishDrag();
      };

      // A trackpad sends bursts of small deltas with no render between them,
      // so the wheel builds on its own pending value (liveCrop) too.
      const onWheel = (event: WheelEvent) => {
        const read = begin({ x: event.clientX, y: event.clientY });
        if (!read) return;
        event.preventDefault();
        ctx.current.onInteract();
        const crop = liveCrop();
        schedule(zoomPhotoBy(crop, read.model, wheelZoomFactor(event.deltaY)));
      };

      const onTouchStart = (event: TouchEvent) => {
        const first = event.touches[0];
        // A second finger joining a gesture already on the card counts even
        // if it lands just off it; a gesture starting off the card is the page's.
        const read = begin(drag || pinch ? undefined : { x: first.clientX, y: first.clientY });
        if (!read) return;
        ctx.current.onInteract();
        if (event.touches.length >= 2) {
          pinch = { distance: touchDistance(event.touches[0], event.touches[1]), crop: liveCrop(), model: read.model };
          drag = null;
        } else if (event.touches.length === 1) {
          drag = { id: -1, x: first.clientX, y: first.clientY, crop: liveCrop(), travel: 0, ...read };
          setDragging(true);
        }
      };
      const onTouchMove = (event: TouchEvent) => {
        if (!ctx.current.enabled) return;
        if (pinch && event.touches.length >= 2) {
          event.preventDefault();
          const distance = touchDistance(event.touches[0], event.touches[1]);
          // Against the pinch's own starting crop, so the zoom tracks the
          // fingers instead of compounding every frame.
          if (pinch.distance > 0) schedule(zoomPhotoBy(pinch.crop, pinch.model, distance / pinch.distance, pinch.crop.scale));
          return;
        }
        if (drag && event.touches.length === 1) {
          event.preventDefault();
          const t = event.touches[0];
          drag.travel = Math.max(drag.travel, Math.hypot(t.clientX - drag.x, t.clientY - drag.y));
          schedule(panPhoto(drag.crop, drag.model, { fx: (t.clientX - drag.x) / drag.rect.width, fy: (t.clientY - drag.y) / drag.rect.height }));
        }
      };
      const onTouchEnd = (event: TouchEvent) => {
        if (event.touches.length < 2) pinch = null;
        if (event.touches.length === 1 && !drag) {
          // One finger lifted from a pinch: carry on as a drag from here,
          // rather than jumping by the distance it travelled during the pinch.
          const read = begin();
          const t = event.touches[0];
          if (read) drag = { id: -1, x: t.clientX, y: t.clientY, crop: liveCrop(), travel: 0, ...read };
        }
        if (event.touches.length === 0) finishDrag();
      };

      frame.addEventListener('pointerdown', onPointerDown);
      frame.addEventListener('pointermove', onPointerMove);
      frame.addEventListener('pointerup', endPointer);
      frame.addEventListener('pointercancel', endPointer);
      frame.addEventListener('wheel', onWheel, { passive: false });
      frame.addEventListener('touchstart', onTouchStart, { passive: false });
      frame.addEventListener('touchmove', onTouchMove, { passive: false });
      frame.addEventListener('touchend', onTouchEnd);
      frame.addEventListener('touchcancel', onTouchEnd);
      cleanups.push(() => {
        frame.removeEventListener('pointerdown', onPointerDown);
        frame.removeEventListener('pointermove', onPointerMove);
        frame.removeEventListener('pointerup', endPointer);
        frame.removeEventListener('pointercancel', endPointer);
        frame.removeEventListener('wheel', onWheel);
        frame.removeEventListener('touchstart', onTouchStart);
        frame.removeEventListener('touchmove', onTouchMove);
        frame.removeEventListener('touchend', onTouchEnd);
        frame.removeEventListener('touchcancel', onTouchEnd);
      });
    }
    return () => cleanups.forEach((fn) => fn());
    // The listeners read everything else from ctx, so only the elements matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...frames, schedule]);

  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);

  /** For buttons and keys: the first frame that is actually showing the photo. */
  const visibleFrame = () => {
    const photoNow = ctx.current.photo;
    if (!ctx.current.enabled || !photoNow) return null;
    for (const frame of frames) {
      if (!frame) continue;
      const read = readFrame(frame, { ...photoNow, crop: liveCrop() });
      if (read) return read;
    }
    return null;
  };

  const zoomBy = (factor: number) => {
    const read = visibleFrame();
    if (!read) return;
    schedule(zoomPhotoBy(liveCrop(), read.model, factor));
  };
  const panBy = (fx: number, fy: number) => {
    const read = visibleFrame();
    if (!read) return;
    schedule(panPhoto(liveCrop(), read.model, { fx, fy }));
  };

  return { dragging, zoomBy, panBy };
}
