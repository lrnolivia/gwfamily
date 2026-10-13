# GW email updates

Email updates are optional and off for every member until they explicitly turn them on in Notifications. The setting belongs to the authenticated account, not the device. Saving an appearance does not choose another recipient or alter any other member’s consent. Turning email off cancels pending/leased rows; already dispatched mail cannot be recalled. Changing a verified sign-in address requires a fresh opt-in. Preview never subscribes or sends.

The eight approved colors are Red, Orange, Yellow, Green, Blue, Violet, Coral pink and Stone. Both light/dark modes and Momo Trust Display/DM Serif Text headings are supported; Inter is the body font. Preferences persist only the preset ID, mode and heading choice. Unsupported legacy colors fall back to Green in the pure renderer; the preference route rejects arbitrary custom colors. The renderer shares the actual app palette and wordmark mapping. Existing profile colors are not rewritten.

## Delivery boundary

Additive migration `0022_email_notifications.sql` creates default-off preferences, a control row and a bounded queue. There is no historical backfill. Only new authorized inbox events for an already opted-in, verified active member enqueue. Runtime additionally requires `EMAIL_SCHEMA_VERSION=1`, the existing `AUTH_EMAIL_ENABLED=true` and the authorized `EMAIL` binding. Existing sign-in/invitation mail remains unchanged. The migration and activation must follow fresh schema/ledger checks and a consistent rollback backup.

The minute schedule claims at most ten rows per invocation, leases each exclusively, and rechecks the current opt-in generation, exact current verified address, membership, resource access, expiry, unread/dismissed state, activity categories, global Off and Following choices immediately before dispatch. Emails contain generic text and an opaque authenticated GW link, never event text, names or private conversation content. The authenticated open reauthorizes the resource. An opt-out, address change, removed membership or global Off cancels pending/leased mail. On does not revive cancelled rows.

The existing `family@greenwhitefamily.com` binding sends one eligible recipient per call. Provider acceptance is recorded as `accepted`; this is not a mailbox receipt or proof of delivery. Definitive quota rejection alone receives bounded backoff within expiry and five attempts. Unknown results, timeouts, internal provider errors and a crash after dispatch become terminal `unknown` and are never resent: the binding has no documented idempotency key. No fabricated header is used as an idempotency guarantee. Sender/configuration rejection halts this channel; a suppressed recipient loses their opt-in. Stored/logged failures use only fixed codes, not provider messages or recipient data.

Every email includes a Notifications settings link. It requires sign-in and is not advertised as one-click unsubscribe. The structured API permits the Auto-Submitted and List-Unsubscribe headers used here. Official binding documentation: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ and https://developers.cloudflare.com/email-service/reference/headers/.

## Rendering and fictional previews

`notificationEmail(input)` and `announcementEmail(input)` return `{subject, preview, html, text, theme}`. Plain content is escaped; action links must use HTTPS greenwhitefamily.com without credentials. Headers reject line breaks/control characters. There is no raw-HTML body slot. The pure renderer does not authorize a recipient; the dispatcher does.

Presentation tables, inline solid colors and bgcolor fallbacks provide a fluid 560px column. Font-capable clients load GW public font assets; Arial/Helvetica and Georgia/Times fallbacks remain readable when fonts are blocked. Outlook has conditional fallbacks. Live text branding survives blocked oak artwork. Mail clients may strip fonts/images/CSS or recolor dark mail; exact cross-client appearance is not claimed.

Run `node scripts/preview-family-emails.mjs` for 64 fictional HTML/plain-text pairs (eight presets × two modes × two fonts × two kinds), plus 16 font/image-blocked fallbacks. Open `docs/family-email-preview/index.html`. Fixed public font assets are cached locally with OFL license text. The generator makes no external writes and never uses actual member data.

`node tests/email-preview-browser.mjs` checks the local matrix, selectors, fonts/fallbacks, overflow, focus and zero outbound requests in headless Chromium. Backend tests use the real additive SQLite schema and a fictional injected sender to exercise opt-in, atomic CAS, generation cancellation, current authorization and dispatch outcome handling. These are isolated tests, not native Safari, physical device, real mailbox or actual email delivery evidence. No real email has been sent as part of this implementation.
