export type GalleryFrameSizing = 'composed' | 'source';

export const GALLERY_FRAME_SIZING_STYLE_PROPERTY = '--field-gallery-frame-sizing';
export const GALLERY_SOURCE_RATIO_STYLE_PROPERTY = '--field-gallery-source-ratio';

const MIN_SOURCE_RATIO = 0.05;
const MAX_SOURCE_RATIO = 20;

export function isGalleryFrameSizing(value: string | null | undefined): value is GalleryFrameSizing {
  return value === 'composed' || value === 'source';
}

export function normalizeGalleryFrameSizing(value: string | null | undefined): GalleryFrameSizing {
  return isGalleryFrameSizing(value) ? value : 'composed';
}

export function parseGallerySourceRatio(value: string | number | null | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(MIN_SOURCE_RATIO, Math.min(MAX_SOURCE_RATIO, parsed));
}

export function normalizeGallerySourceRatio(value: string | number | null | undefined): number {
  return parseGallerySourceRatio(value) ?? 1;
}

export function formatGallerySourceRatio(value: string | number | null | undefined): string {
  const normalized = normalizeGallerySourceRatio(value);
  return String(Number(normalized.toFixed(6)));
}

export function gallerySourceRatioPatch(value: string | number | null | undefined): Record<string, string> {
  return { [GALLERY_SOURCE_RATIO_STYLE_PROPERTY]: formatGallerySourceRatio(value) };
}

export function gallerySourceAspectRatio(value: string | number | null | undefined): string {
  return formatGallerySourceRatio(value) + ' / 1';
}

export function galleryCarouselSourceImageWidth(value: string | number | null | undefined): string {
  const ratio = normalizeGallerySourceRatio(value);
  const widthAt720Height = Math.max(1, Math.min(720, Math.round(720 * ratio)));
  return 'min(' + widthAt720Height + 'px, calc(100% - 32px))';
}
