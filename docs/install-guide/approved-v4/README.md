# Green & White install guide — Preview Home action-focused v4

This replaces compact v3 and full-screen v2. Lauren requested gentler gradients, less excess visual context and an explicit first iPhone image showing how to open Safari's page menu. Her exact clarification: "android is complete with three screens", "iphone neds four", and "the first image is easy just duplicate the current first screen move the view down, get rid of the menu and highlight the menu option?"

The previously authorized delivery target remains the current Mac worker, “Deploy verified GW build” (01a11b04-95a2-7212-aa48-1e23e956d00a). This is artwork delivery, not a repository ownership transfer or release receipt.

## Flows

- iPhone — FOUR images: Open Safari page menu → Share → Add to Home Screen → Add.
- iPad Air — THREE images: Share in toolbar → Add to Home Screen → Add.
- Pixel phone and Pixel Tablet — THREE images: Open Chrome menu → Add to Home screen → Install.
- Do not hardcode three steps globally. Use deviceStepCounts and flows in manifest.json.
- iPhone filenames 1–3 have changed meaning: new 1 is Page Menu; former 1/2/3 are now 2/3/4. Update written instructions, progress/counts, next/back/final behavior, asset loading and accessible descriptions together.
- ios-page-menu.svg already exists among the unchanged inline controls. Use it for the new first written instruction.

## Delivered artwork

234 transparent PNGs across Default plus the eight designated accent colors; four devices; light/dark. There are 72 iPhone images and 54 for each other device. The 25 useful inline SVG controls and exact Material Expressive palette file are byte-identical to v2/v3.

Phone canvases are 360 pixels high; tablet canvases are 440 pixels high. Intrinsic sizes: iPhone 482×360, iPad Air 940×440, Pixel phone 521×360 and Pixel Tablet 991×440. Crops center on the actionable target and marker; keep nearby context and device side rails. The iPhone first image retains the bottom physical edge and native address bar.

Each cut edge now fades to true alpha across 30% of compact height: 108 pixels on phones, 132 on tablets. A 17-stop gradual curve replaces the old shorter fade. The same canvas, fade curve and crop-edge rule apply across every accent/mode for each device/step. Targets and numbered markers remain fully opaque. Native contents and device hardware are not scaled or squashed. Yellow's narrower iPhone Air body is centered on the common canvas.

No guide-added blur. Dim layers remain black at opacity 0.32. Native genuine Apple Glass is retained. The closed-menu iPhone first view duplicates the existing first screen, hides the native menu and its retained outline layers, keeps the native toolbar and moves the spotlight to its actual Page Menu glyph.

The 72 Preview Home source images remain the actual-Chrome preview captures from https://greenwhitefamily.com/#/home, build b3805113f4f49220c35b. No profile or live-data substitution. Browser/OS chrome is native Figma kit illustration, not a physical-device capture.

## Implementation

- Mobile/tablet: route by OS, phone/tablet, selected light/dark mode and resolved designated interface/profile color. Default uses Default. Keep existing resolver identifiers.
- The eight designated colors and profile-color support stay; the separate Custom option is gone.
- Theme/color selection changes must update the guide. Apple Home uses Glass; Android Home uses Flat.
- Hide desktop guide and menu entry. Retain iPadOS desktop-like identification; viewport width alone is insufficient.
- Render intrinsic aspect ratio with width:100%, height:auto. Alpha fades are baked into PNGs. No extra CSS gradient/mask, blur/filter, opaque image matte, object-fit:cover, stretching or full-device-height wrapper.
- Preserve native colors, continuous Apple corners, real greenwhitefamily.com domain/GW icon and touch target alignment.
- Inline SVGs are for useful controls in written instructions. Five monochrome symbols support currentColor; native Apple Add stays system blue; Android Install has 18 primary/onPrimary variants. Provide accessible instructions without duplicate screen-reader prose from decorative artwork.
- Integrate under current admitted Relay scope. Fresh Relay observation still describes completed v2 work; do not infer new release authority or acceptance criteria from that completed record.

## Files

screens/ — 234 PNGs with updated dimensions, actions, Figma IDs and hashes in manifest.json.
inline-controls/ — 25 SVGs, unchanged.
previews/ — four review boards with current flows in both modes.
material-expressive-palettes.json — exact Material Color Utilities 0.4.0 SchemeExpressive palette roles.
verification.json — structural readback plus per-PNG alpha, fade, dimensions and target checks.
SHA256SUMS — every payload file's checksum, excluding this list itself.

Editable Figma: https://www.figma.com/design/ovUWQhaEiWYjMDSIfBbCnn/
Default compact four-step iPhone board: 159:9655. Other accent boards are in manifest.json.
Full-screen source boards remain available. Preview Home image board: 151:5588. Useful inline controls: 96:3625.

Hardware provenance remains official Apple iPhone 17/iPhone Air/iPhone 17 Pro bezels plus iPad Air, Pixel 9 Pro and Pixel Tablet assets. Approved adapted accent finishes do not claim retail availability.
Native Apple kit: https://www.figma.com/design/mUkFdbVfpGqBcHndq14Leg/
Hardware/palette references: https://developer.apple.com/design/resources/ ; https://github.com/jamesjingyi/mockup-device-frames ; https://github.com/material-foundation/material-color-utilities

No application source edits, build, tests, merge or deployment are claimed by the artwork producer. The implementation worker owns app integration and its required verification/release gates.
