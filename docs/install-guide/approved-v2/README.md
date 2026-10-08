# Green & White install guide — Preview Home v2

This is the corrected 2026-10-08 artwork delivery for the successor GW worker, “Finish GW production release”. It supersedes the withdrawn seven-accent export attempt and its HOLD/PENDING notes. Lauren authorized delivery: “when you finish hand off your work to the new gw worker, the old one is retired.” Latest capture constraints: “with preview mode”, “we're in preview mode now”, “we only need the home screens”, “no profiles”.

## Delivered artwork

216 transparent device PNGs: Default plus Red, Orange, Yellow, Green, Blue, Violet, Coral pink and Stone; iPhone, iPad Air, Pixel phone and Pixel Tablet; light/dark; three steps each. The manifest maps every file to accent, OS, form factor, theme, step and exact Figma wrapper ID. Exported at the artwork's native scale without stretching. The current Figma file retains editable screenshot slots and genuine native UI kit components.

72 fresh preview Home page images were captured from https://greenwhitefamily.com/#/home in Lauren's actual Chrome, using four responsive viewport/UA configurations. Capture source build: b3805113f4f49220c35b. No profile-page or live-data capture is included. Browser/OS chrome in the illustrations is native Figma kit artwork, rather than physical-device browser capture.

Android correction: the dim overlay spans the entire native screen opening. The slight blur sits behind native Chrome, so the toolbar, overflow menu and install action stay sharp. Apple native Glass is retained. All 216 editable page fills preserve proportions; all 108 light/dark spotlight pairs and hardware pairs match; all 18 iPhone keyboards are flush at screen bottom. Four full flow renders were visually inspected after the update. See verification.json.

## Implement this behavior

- Three full screens per flow. Apple: Share, expanded Add to Home Screen sheet, Add. Omit the collapsed share sheet. Android: open Chrome menu, Add to Home screen, Install.
- Mobile/tablet: use the appropriate OS and phone/tablet set, selected light/dark mode, and resolved designated interface/profile color. Default uses the Default set. Use the app's actual color resolver and identifiers; display labels in this manifest are not a request to rename stored keys.
- The eight designated choices remain. The separate Custom interface option is being removed. Preserve approved profile-color support.
- React to theme/color changes. Match the selected app appearance, with Glass Home content for Apple and Flat Home content for Android.
- Desktop: hide the guide and its menu entry. Detect OS and form factor using existing app capabilities, including iPadOS desktop-like identity; viewport width alone is insufficient.
- Preserve the real greenwhitefamily.com domain and GW icon, continuous Apple corners, native component geometry, full overlay coverage and aligned spotlights.
- Use only useful inline native controls in the written guide. Five monochrome symbols support currentColor. Apple Add actions retain native system-blue appearance. Android Install actions include 18 primary/onPrimary palette variants. These small controls are appropriate for both phone and tablet. Supply accessible text; decorative artwork should not duplicate screen-reader instructions.

## Files and verification

screens/ — 216 transparent finished PNGs.
inline-controls/ — 25 SVGs (five symbols, two Apple Add appearances, 18 Android Install color/mode variants).
previews/ — four review boards showing all steps in both modes.
manifest.json — file routing, Figma IDs, dimensions, source hashes and output hashes.
material-expressive-palettes.json — exact Material Color Utilities 0.4.0 SchemeExpressive, contrast 0, 2025 phone spec, semantic role colors. Android wallpaper/system color matching is the user-requested design assumption.
verification.json — structural readback across all current Figma variants.
SHA256SUMS — complete delivered file integrity list, excluding this checksum list itself.

Figma: https://www.figma.com/design/ovUWQhaEiWYjMDSIfBbCnn/
Current source image board: 151:5588.
Useful native inline control board: 96:3625.
Original native source boards remain on Page 1. The current accent pages are listed in manifest.json.

Hardware sources: official Apple iPhone 17 / iPhone Air / iPhone 17 Pro bezels, plus real iPad Air, Pixel 9 Pro and Pixel Tablet assets. Pixel 9 Pro is an approved nearby model. Adapted accent finishes are labeled; they do not claim retail availability.

Sources:
- https://developer.apple.com/design/resources/
- https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg
- https://github.com/jamesjingyi/mockup-device-frames
- https://github.com/material-foundation/material-color-utilities
- https://chromium.googlesource.com/chromium/src/+/main/docs/ui/android/dynamic_colors.md
- Native Apple UI library supplied in the session: https://www.figma.com/design/mUkFdbVfpGqBcHndq14Leg/
- Native kit components and published variable/effect links remain in the editable file.

No application source was changed by this design task. No build, tests, merge or deployment is claimed. Integrate within your current admitted Relay assignment; this delivery does not transfer repository/release ownership or change your release gates. Verify the guide in the actual app after integration.
