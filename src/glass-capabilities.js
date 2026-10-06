// Keep SVG refraction on WebKit, but use one displacement pass per surface.
// Chromatic dispersion adds three passes over a live backdrop. iOS browsers
// share WebKit; desktop Chromium browsers are excluded from this policy.
export function needsSinglePassRefraction(userAgent='') {
  return /AppleWebKit\//i.test(userAgent)&&!/(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
}
export function singlePassRefraction() {
  return typeof navigator!=='undefined'&&needsSinglePassRefraction(navigator.userAgent);
}
