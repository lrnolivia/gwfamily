# grnwht

Green & White family reunion app. This first source slice is a private visual prototype, not a production service.

## Run

Serve `dist/` using any static web server. No install or build step is required. JavaScript syntax check: `node --check dist/app.js`.

## Implemented in the preview

- Forest/off-white Terra Prime-inspired light and dark themes with a brighter green action accent
- Responsive phone and tablet layout (tablet layout also serves desktop)
- Floating labeled bottom navigation and contextual action button
- Family feed, example poll, reunion overview, microprofile and illustrative family tree
- Household RSVP and shirt selection demos, kept only in memory for the current visit
- Planner preview and external-payment handoff/treasurer-confirmation states
- Small tree mark as an editable SVG

## Not implemented yet

Production authentication, role authorization, durable storage, uploads, real posts, real family relationships, real payment links, payment verification, push notifications, and full offline/installable PWA behavior.

## Product boundaries

The app never holds money. Household contributions go directly to the designated treasurer through verified PayPal.Me/Cash App links. Link opening and self-reporting never prove receipt. Only the treasurer can confirm receipt or change payout destinations. Do not invent or activate payment recipients.

Google, Apple (subject to verified developer prerequisites), and email OTP are the intended sign-in options. Planner, moderator, administrator and treasurer permissions must be enforced by the backend. The Planner tools entry under You in this preview is not authorization.

Licensed generic family photos are clearly marked as sample photography. See docs/PHOTO_CREDITS.md. No actual Green & White family records are included. Sample poll percentages and tree connections are explicitly illustrative. Dates, prices, recipient accounts and order deadlines remain unset.
