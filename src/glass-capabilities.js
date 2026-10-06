// WebKit uses native blur/tint glass rather than stacking an SVG feImage
// displacement graph on live backdrop surfaces. iOS browsers share WebKit;
// desktop Chromium browsers are excluded from this policy.
export function usesNativeGlassOnly(userAgent='') {
  return /AppleWebKit\//i.test(userAgent)&&!/(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
}
export function nativeGlassOnly() {
  return typeof navigator!=='undefined'&&usesNativeGlassOnly(navigator.userAgent);
}
