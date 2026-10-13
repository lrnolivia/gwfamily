# Native provider sign-in buttons

Lauren authorized native buttons with the app’s interface typeface on 2026-10-08. Google, Microsoft and Yahoo now share a responsive 320px maximum width, 56px height, centered logo/label group and consistent spacing. The supplied logos retain their proportions and colors. Authentication, enabled-provider flags and account handling are unchanged.

Google’s current gradient G is the original PNG from https://developers.google.com/static/identity/images/g-logo.png, embedded with a SHA-256 identity in `src/official-sign-in-brand.mjs`. Microsoft’s four-color symbol uses the exact rectangles from the original SVG documented in `provider-branding-assets.json`. Yahoo’s supplied white Y mark is displayed through a logo-sized viewport into its original purple button PNG, without changing the stored bytes.

The original complete-button artwork remains retained with its hashes and upstream provenance. Native labels use the existing interface typeface as explicitly requested by Lauren; they do not claim to be the providers’ complete pre-approved button artwork. Google and Microsoft surfaces respect the explicit app theme; Yahoo retains its purple surface. Keyboard focus, forced-color text, accessible names and disabled/busy handling remain native. No external image or font request occurs at sign-in time, and no authentication SDK was added.

Brand sources: https://developers.google.com/identity/branding-guidelines, https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps, https://developer.yahoo.com/sign-in-with-yahoo/. Trademarks belong to their providers.
