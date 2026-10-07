// Browser readback and pure compositing math shared by hosted and Node checks.
// The tint paints above the button's background; checking the host alone misses it.
export function readPageSavePaint(button) {
  const tint = button.querySelector(':scope > .liquid-glass-tint');
  const label = button.querySelector(':scope > .gw-optic-content > span:last-child') || button.querySelector(':scope > span:not([aria-hidden])') || button;
  if (!label.textContent.trim()) throw new Error('The editor control must have a visible text label.');
  const hostStyle = getComputedStyle(button), labelStyle = getComputedStyle(label);
  let labelOpacity = 1;
  for (let node = label; node && node !== button; node = node.parentElement) labelOpacity *= Number(getComputedStyle(node).opacity);
  const toolbar = button.closest('.page-edit-modebar');
  if (!toolbar) throw new Error('The editor control must be inside the edit toolbar.');
  const ancestors = [];
  for (let node = button.parentElement; node; node = node.parentElement) ancestors.push(Number(getComputedStyle(node).opacity));
  return {
    theme: document.documentElement.dataset.theme, platform: document.documentElement.dataset.platform,
    disabled: button.disabled, text: label.textContent.trim(),
    foreground: labelStyle.color, hostForeground: hostStyle.color,
    hostBackground: hostStyle.backgroundColor, hostOpacity: Number(hostStyle.opacity),
    tintBackground: tint ? getComputedStyle(tint).backgroundColor : null,
    tintOpacity: tint ? Number(getComputedStyle(tint).opacity) : 1,
    backdrop: getComputedStyle(toolbar).backgroundColor, labelOpacity, ancestors,
  };
}

export function parsePaintColor(value) {
  const text = String(value).trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];
  if (/^#[0-9a-f]{6}$/.test(text)) return [1, 3, 5].map(start => parseInt(text.slice(start, start + 2), 16) / 255).concat(1);
  const match = /^(rgba?|color)\((.*)\)$/.exec(text);
  if (!match) throw new Error('Unsupported computed paint color: ' + value);
  const srgb = match[1] === 'color';
  if (srgb && !/^srgb\s/.test(match[2])) throw new Error('Unsupported computed color space: ' + value);
  const parts = match[2].replace(/^srgb\s+/, '').trim().split(/[\s,\/]+/);
  if (parts.length !== 3 && parts.length !== 4) throw new Error('Invalid computed paint color: ' + value);
  const numbers = parts.map((part, index) => Number.parseFloat(part) / (part.endsWith('%') ? 100 : index < 3 && !srgb ? 255 : 1));
  if (numbers.some(number => !Number.isFinite(number) || number < 0 || number > 1)) throw new Error('Invalid computed paint channels: ' + value);
  return numbers.length === 3 ? [...numbers, 1] : numbers;
}

const over = (foreground, background, opacity = 1) => foreground.slice(0, 3).map((channel, index) => channel * foreground[3] * opacity + background[index] * (1 - foreground[3] * opacity)).concat(1);
const luminance = color => color.slice(0, 3).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
export function pageSaveContrast(paint) {
  // The edit toolbar is an opaque backdrop; fail rather than invent a color if
  // future styling makes its ancestor chain translucent.
  if (paint.ancestors.some(opacity => opacity !== 1)) throw new Error('Unexpected translucent Save ancestor.');
  const backdrop = parsePaintColor(paint.backdrop);
  if (backdrop[3] !== 1) throw new Error('The edit toolbar backdrop must be opaque.');
  for (const opacity of [paint.hostOpacity, paint.labelOpacity, paint.tintOpacity]) if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Invalid Save paint opacity.');
  let surface = over(parsePaintColor(paint.hostBackground), backdrop);
  if (paint.tintBackground !== null) surface = over(parsePaintColor(paint.tintBackground), surface, paint.tintOpacity);
  const label = over(parsePaintColor(paint.foreground), surface, paint.labelOpacity);
  const foreground = over(label, backdrop, paint.hostOpacity), background = over(surface, backdrop, paint.hostOpacity);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
