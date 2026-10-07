# Official provider sign-in buttons

Verified against the providers’ public documentation on 2026-10-06. The six shipped assets are original complete buttons. Their typography, logo, spacing, background, border, and proportions are preserved. Provenance and SHA-256 digests are in `provider-branding-assets.json`.

## Google

Source: https://developers.google.com/identity/branding-guidelines

The current guide was updated 2026-07-07 and supplies the gradient G, Google Sans, and light/dark buttons. This implementation uses the original Android/Web rectangular 4× PNGs from Google’s archive. The current SVG export contains a `foreignObject` conic gradient, so the supplied PNG avoids relying on SVG HTML rendering. The archive’s SVG originals are retained only as provenance, not deployed. No substitute font or logo is drawn.

## Microsoft

Source: https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps

The complete light and dark SVGs are downloaded directly from the official article. Text is outlined in the supplied artwork, so it retains its original appearance without loading Segoe UI or another font. Both buttons preserve Microsoft’s symbol and full sign-in wording. The component does not imply that work/school or personal account types are supported beyond the actual authentication configuration.

## Yahoo

Source: https://developer.yahoo.com/sign-in-with-yahoo/

The official rectangular archive supplies PNGs only. Both original full-color light and purple dark buttons are included. The Yahoo Sans Semibold lettering and the supplied mark remain unchanged. Yahoo asks developers to use its provided artwork, preserve proportions, and give its button similar prominence to other providers. The Y-shaped artwork here comes from that original complete button; it is not a recreated standalone logo.

## Integration and accessibility

Only the sign-in providers advertised by the existing capability layer are mapped. Branding availability is not an authentication capability. Native buttons keep full accessible labels and do not submit the email-code form. All buttons share a 252px-wide frame and at least a 56px interaction height. The image aspect ratio remains unchanged. Disabled/busy controls suppress activation and show a separate waiting label; the artwork itself is not faded, recolored, cropped, or distorted. High-contrast mode provides system-color text controls. Theme selection respects the app’s explicit light/dark setting, with system preference only when no app setting is present.

Assets use content-hashed same-origin paths under `dist/brand/sign-in/`. Rendering does not fetch third-party images or fonts and does not load any new authentication SDK. Trademarks remain the property of their respective providers.
