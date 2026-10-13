export const GALLERY_IMAGE_ZOOM_STYLE_PROPERTY = '--field-gallery-zoom';
export const GALLERY_IMAGE_ROTATION_STYLE_PROPERTY = '--field-gallery-rotation';
export const GALLERY_IMAGE_TRANSFORM_VALUE = `scale(var(${GALLERY_IMAGE_ZOOM_STYLE_PROPERTY}, 1)) rotate(var(${GALLERY_IMAGE_ROTATION_STYLE_PROPERTY}, 0deg))`;

export const GALLERY_MIN_ZOOM = 1;
export const GALLERY_MAX_ZOOM = 4;

export interface GalleryMediaTreatment {
  objectPosition: string;
  zoom: number;
  rotation: number;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampGalleryZoom(value: number): number {
  if (!Number.isFinite(value)) return GALLERY_MIN_ZOOM;
  return Math.min(GALLERY_MAX_ZOOM, Math.max(GALLERY_MIN_ZOOM, value));
}

export function normalizeGalleryRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return rounded(normalized);
}

export function parseGalleryZoom(value: string | number | undefined | null): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return clampGalleryZoom(parsed);
}

export function parseGalleryRotation(value: string | number | undefined | null): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return normalizeGalleryRotation(parsed);
}

export function formatGalleryZoom(value: number): string {
  return String(rounded(clampGalleryZoom(value)));
}

export function formatGalleryRotation(value: number): string {
  return `${rounded(normalizeGalleryRotation(value))}deg`;
}

export function galleryMediaTreatmentPatch(
  objectPosition: string,
  zoom: number,
  rotation: number,
): Record<string, string> {
  return {
    objectPosition,
    // The focal point is also the transform origin. At zoom > 1 this lets the
    // same source-backed focal coordinates pan the enlarged bitmap naturally.
    transformOrigin: objectPosition,
    [GALLERY_IMAGE_ZOOM_STYLE_PROPERTY]: formatGalleryZoom(zoom),
    [GALLERY_IMAGE_ROTATION_STYLE_PROPERTY]: formatGalleryRotation(rotation),
    transform: GALLERY_IMAGE_TRANSFORM_VALUE,
  };
}

export function neutralGalleryMediaTreatmentPatch(): Record<string, string> {
  return galleryMediaTreatmentPatch('50% 50%', 1, 0);
}

