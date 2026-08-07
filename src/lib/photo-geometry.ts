/**
 * The one place a saved photo crop/zoom/position turns into CSS. Emblem
 * OS (CardFace, reading card_definitions.photo.crop) and the print-capture
 * rig (reading the live player.photo.crop) both render through the same
 * CardArt component, and CardArt's several per-family photo layers
 * (EMJFL/Hollinwood/Custom/RealCardArt) all called this identical formula
 * inline before this extraction — there was already only one calculation,
 * not two; this makes it a single named, independently testable function
 * instead of four copies of the same string template.
 */

export type PhotoCrop = { x: number; y: number; scale: number };

export type PhotoGeometry = {
  objectFit: 'cover';
  objectPosition: string;
  transform: string;
  transformOrigin: string;
};

/**
 * `objectPosition` varies slightly by template family (most use
 * 'center 12%', RealCardArt's procedural fallback uses 'center 10%') —
 * passed through rather than hard-coded so this stays the single source
 * of the *scale/offset* rule without forcing every family onto identical
 * framing.
 */
export function computePhotoGeometry(crop: PhotoCrop | null | undefined, objectPosition: string): PhotoGeometry {
  const scale = crop?.scale ?? 1;
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;
  return {
    objectFit: 'cover',
    objectPosition,
    transform: `translate(${x}%, ${y}%) scale(${scale})`,
    transformOrigin: 'center center',
  };
}
