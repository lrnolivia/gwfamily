// WebKit uses native blur/tint glass rather than stacking an SVG feImage
// displacement graph on its live backdrop surfaces. Keep this guard consistent
// for the shared filters and every per-element lens, including hidden popovers.
// iOS Chrome/Firefox/Edge also use WebKit; desktop Chromium only is excluded.
export function usesNativeGlassOnly(userAgent='') {
  return /AppleWebKit\//i.test(userAgent)&&!/(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
}
export function nativeGlassOnly() {
  return typeof navigator!=='undefined'&&usesNativeGlassOnly(navigator.userAgent);
}
