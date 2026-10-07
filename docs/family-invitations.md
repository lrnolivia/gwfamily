# Family invitations and temporary read-only access

Family invitations record the inviter after a verified recipient signs in and completes a profile. Acceptance never changes membership status or roles. An organizer still approves membership. The People administration list shows the inviter.

Invitation links use a random secret in the URL fragment and store only its SHA-256 hash. They expire after seven days. An optional email binds redemption to that verified address. A removed or inactive sender cannot issue an effective invitation. Creation is limited to active members and ten links per day. Email delivery requires the explicit Send email invitation action; uncertain delivery revokes that link. Production email delivery has not been exercised for this feature. The existing send binding follows the [official Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/get-started/send-emails/).

`FAMILY_INVITATIONS_ENABLED` defaults off. `LAUNCH_PROVISIONAL_READ_ENABLED` independently defaults off. Applying migration 0019 does not activate either feature. Enabling either flag requires separate action-time authorization.

When temporary viewing is authorized, only verified, profile-complete, pending members without a recorded accepted invitation qualify. They can read family-wide posts and shared memory photos. Group posts, private conversations, contact records, roles and all family interactions remain unavailable. Each image request rechecks eligibility and verifies that its media ID is present in the permitted feed. Turning the launch flag off removes access on subsequent requests. Signing out or removal removes eligibility.

Preview uses fictional invitation drafts with its own reset action and a fictional read-only welcome. It makes no external requests to issue invitations or send email. The hosted browser fixture uses an in-memory database and a fake email binding.

The current production Worker has an email binding and no configured SMS transport. SMS availability investigation found no existing integration to activate; adding one would require a provider and a separately authorized implementation. No SMS capability is claimed here.

Required hosted browser checks cover link creation, pending read-only access, denied private APIs and loss of provisional access after acceptance. Static and guarded Node checks do not establish real email delivery, browser behavior or Cloudflare runtime acceptance.
