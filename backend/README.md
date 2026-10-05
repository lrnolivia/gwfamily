# gwfamily Worker backend

Cloudflare Workers service for Green & White. This is an initial, locally verified backend slice, not a deployed family service.

## Reuse decision

Hono handles Web-standard routing. Better Auth 1.7.7 handles OAuth/session machinery; the app does not invent authentication. Its current types accept a Cloudflare D1 binding. Auth SQL is generated from that installed version. Google and Apple providers are enabled only when their runtime credentials exist. Email OTP is still pending a mail-provider choice. No credentials have been generated or stored.

HumHub was considered because its REST API covers posts, threaded comments, polls, calendars and notifications. It requires PHP/MySQL and therefore cannot itself run inside the requested Cloudflare Worker. Its API remains an option only with a separately hosted upstream. The current Worker-native foundation trades a prebuilt social product for small reusable infrastructure and explicit app-level features.

Sources checked October 5, 2026:
- https://better-auth.com/docs/integrations/hono
- https://better-auth.com/docs/authentication/apple
- https://better-auth.com/docs/adapters/other-relational-databases
- https://hono.dev/docs/getting-started/cloudflare-workers
- https://developers.cloudflare.com/d1/worker-api/
- https://docs.humhub.org/docs/admin/requirements/
- https://github.com/humhub/rest/blob/master/docs/MANUAL.md

## Implemented locally

- Better Auth boundary, disabled password login, Google/Apple configuration hooks, secure cookies, explicit trusted origin.
- Active family membership required separately from sign-in. Family/Loved Ones belonging; additive leader flag; explicit admin/moderator/planner/treasurer capabilities.
- Family feed, author feed and close-family group feed filters; editor-only initial posting.
- Comments and validated same-post parent reply links.
- Multi-size shirt claims without payment gating, owner-only received confirmation.
- Policy functions for notification audiences and private conversation access.
- Editable surname-based group-name suggestions; suggestion never infers membership.
- SQL schemas for future notifications, groups, invitations, fees and conversations.

## Not connected or complete

No deployment, live D1/R2 resources, custom domain, auth providers/secrets, frontend API adapter, push delivery, email OTP, invitation redemption, message routes, upload routes, rate limits, media scanning, backup scheduling or production rollback exercise. Schemas alone do not implement those features. DMs are not end-to-end encrypted. Add explicit privacy/retention controls before enabling messages. No claim that private directory data or children’s information has been collected.

## Run

npm ci --ignore-scripts
npm run check
npm test
npm run build

Runtime setup must bind DB, configure approved auth secrets and enable verified providers before protected routes work. Until configured, protected routes return503. Do not invent resource IDs in wrangler.jsonc. Keep deployment through the repository's admitted GitHub-to-Cloudflare build path. Apply additive migrations only after verified backup and target selection. Neither Sites hosting nor an unrelated Worker is an acceptable fallback for this backend.

## Remaining acceptance map

| Flow | Backend requirements | Verification gate |
| --- | --- | --- |
| Invitation and sign-in | expiring/revocable invitation, hashed token, approved membership, trusted providers, recovery/session revocation | replay, expiry, inactive member, wrong account |
| Profile and group feeds | group membership, moderation, exact ownership, profile field visibility | cross-member edit denial and scoped group reads |
| Reactions and favorites | idempotent per-member emoji/favorite rows; private favorites | repeat toggle, permission boundaries |
| Media and files | private R2 objects, size/type checks, safe download, malware handling, ownership | unauthorized download and MIME confusion |
| Shirt bag/claim | product+size quantities, idempotency, no fee gate, planner fulfillment, tracking URL checks | duplicate claim and owner/planner boundaries |
| My fees | self-report remains pending, treasurer confirmation audit, verified destination | cannot mark self paid or alter recipient |
| Notifications | Family/Selected/Leaders/Off, individual subscriptions, revocation, quiet/privacy controls | no implicit opt-in or private message body leakage |
| DMs | participant-only access, blocks/reporting, deletion/retention, notification privacy | nonparticipant/admin-read denial |
| Operations | request/body limits, rate control, structured errors, backups, restores, audit, isolated test data | real restore and auth failure tests |

One family only now. Multi-tenant commercial generalization and researched family-tree import come later.
