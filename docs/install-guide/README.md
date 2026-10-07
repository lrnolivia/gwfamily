# Installation guide control recreations

These are original vector recreations of native controls, not OS screenshots.
They teach the officially documented actions without inventing a captured device,
an observed browser build, a completed install, or notification permission.

## Coverage

| Guide | Native controls recreated | Launch context |
|---|---|---|
| iPhone / iPad | Safari Compact Page Menu / More → Share; direct Share for Top / Bottom; iPad Share → More; cropped Share actions; Add screen with enabled Open as Web App and Add | Written Home Screen instruction |
| Android | Chrome More; Install and create shortcut → Install; representative browser confirmation | Written Home Screen / app drawer instruction |
| macOS | Safari File → Add to Dock; Add dialog with editable name | Synthetic Spotlight result for the installed app |
| Windows | Chrome More → Cast, save, and share → Install page as app; Edge alternative Settings and more → More tools → Apps → Install this site as an app; Chrome confirmation | Synthetic Chrome Apps entry; Start shortcut is conditional |
| ChromeOS | Chrome install menu and confirmation | Synthetic Launcher search result |

Unknown browsers have written help only. We do not fabricate a platform-specific
menu. Desktop Safari examples require macOS Sonoma 14 or later. Installation and
notification consent remain separate. Desktop installation is optional for the
supported push-capability paths already implemented in the release candidate.

The iOS/iPadOS examples use the versioned 26 documentation. Apple's newer guide
calls the compact control Page Menu; the version-26 guide calls it More. The guide
accepts both labels and accommodates iPad's More / View More wording. Chrome and
Edge versions are deliberately unspecified because no native build was observed.
This is a supported-platform guide, not exhaustive browser-by-browser visual
coverage. Firefox continues to use the website without an invented install flow.

## Sources, verified 6 October 2026

- [Apple: iPhone, version 26](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26/ios/26)
- [Apple: iPad, version 26](https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/26/ipados/26)
- [Apple: Safari apps on macOS](https://support.apple.com/en-us/104996)
- [Google: Chrome on Android](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid)
- [Google: Chrome desktop / Chromebook apps](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DDesktop)
- [Microsoft: Edge apps](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge)

Only the text/control semantics of these sources were used. The denied official
WebKit Add-screen image was not fetched, copied, reproduced from pixels or obtained
by an alternate route. No native browser or OS was impersonated by viewport resizing.

## Assets and honesty

`provenance.json` records each of the 16 SVGs, its SHA-256, OS, browser, unobserved
version/build scope, creation/check date, official source URLs, exact SVG dimensions,
crop/layout description, full alternative text and typography. Each SVG embeds the
same record (except its own hash), includes an accessible title/description, and
has a visible Recreation footer outside the native chrome. The surrounding app
also labels each figure Control recreation and puts the explanation in a caption.

Only the public GW app identity, the existing local icon and synthetic neutral
native controls are shown. There are no private feeds, notifications, account
details, contact suggestions or real family content. Synthetic installed-app
results illustrate where to open an app after the user finishes installation;
they do not assert that the user's device already has it.

Positions, rounded shapes, neutral materials, omitted rows and dialog wording
around the documented action are representative. The source descriptions are the
semantic authority. Exact release-specific native pixel fidelity is unverified.
The served SVGs request native Apple, Android, Windows or Chrome UI font families
with honest sans-serif fallbacks. The non-browser audit renders use installed
Linux DejaVu Sans. They prove asset drawing/bounds only, not native typography.

## Implementation and reversible integration

- `src/install-guide-visuals.jsx` selects the guide stage, supports optional Safari
  toolbar examples with the existing radio ChoiceControl, supplies informative
  image alternatives, and recovers to written instructions on an asset failure.
- `src/install-guide-visuals.css` uses existing product surface/text tokens outside
  the native chrome, stacks readable crops, reserves intrinsic image dimensions,
  and supports narrow screens and forced colors. Glass/Flat and themes are retained.
- `src/install-guide-assets.js` is the immutable asset registry. Assets live under
  `dist/install-guide/` so the existing deployment includes them without a new loader.
- `src/install.jsx` only swaps the old diagrams, adds official source links, labels
  recreations honestly, and preserves full-page Back versus optional sheet dismissal.
- `src/install-capabilities.js` keeps platform/capability truth and adds source-based
  desktop confirmation stages. No notification grants or automatic install prompts
  were introduced. Actual install still requires the existing user-click button.

Restore the pre-change `install.jsx` and `install-capabilities.js`, then omit the
new visual/registry/CSS files and assets when rebuilding to roll back. There is no
schema, backend, account, device-setting or irreversible-data change.

## Verified and pending gates

Offline tests inspect the explicit files and render components on the server under
a deny-runtime guard that blocks transport/listener APIs, browsers and arbitrary
subprocesses. Only the hash-pinned installed esbuild service can run. The runtime is
Node 24.19.0, not the required hosted Node 22 acceptance runtime.

The geometric drawings received one batched non-browser audit and one confirmation
pass. These audit PNGs are not browser screenshots or device acceptance evidence.
The hosted-only help fixture has source updates to serve the static SVGs, check
Safari variants, verify loaded assets and exercise all desktop platform choices.
That fixture was not executed locally.

Still required before release: the integrated Node 22 build/full suite; authorized
hosted browser acceptance across Glass/Flat, light/dark, mobile/tablet/desktop,
large text and accessibility; physical iPhone/iPad, Android, macOS, Windows and
ChromeOS comparison of the documented controls; actual device installability and
separate notification capability/consent checks. No deployment has been performed.
