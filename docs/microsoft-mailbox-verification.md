# Microsoft first-login mailbox confirmation

Prepared source only. This separate packet does not activate Microsoft, send real email, link a real account, create credentials, alter Cloudflare security settings, or migrate the database. It follows the existing Cloudflare Access plan.

## Member experience

1. Select Continue with Microsoft and authenticate with a personal Microsoft account.
2. The first time, GW asks for the email used for the family account. Microsoft's email is a suggestion and may be edited.
3. Explicitly request a six-digit email code, then enter it in the same browser. A checkbox and button clearly say that this connects Microsoft to the GW account for the displayed email. Existing members use their existing GW email.
4. Only successful code verification plus explicit confirmation creates or links the account. New members continue to the existing editable name/profile form and organizer-approval gate. Existing names and permissions stay unchanged.
5. Later Microsoft sign-ins use Microsoft's immutable tenant/object identifier, so another mailbox code is not required. A later change to the Microsoft email or display name does not change the GW account or stored name.

No account is created from an unverified Microsoft email. The code is purpose-specific; verifying a normal email-code sign-in in another browser cannot accidentally attach an attacker's pending Microsoft identity.

## Microsoft and Cloudflare configuration

Use the current Microsoft Entra app-registration workflow, with Personal accounts only. The retired Azure AD B2C tutorial is not needed. The current registration guide lists an Azure account with an active subscription and a suitable directory/role as prerequisites; this packet does not promise free tenant creation or authorize a subscription purchase.

- [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Personal-account discovery](https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration)

Cloudflare's Generic OIDC integration should request openid, email and profile. Forward these custom claims in this order: oid, tid, name, given_name, family_name. The oid and tid claims establish immutable identity and must be present; an Access email-based outer sub is not used as Microsoft's account key. Email verification is supplied by GW's one-time mailbox check, so Microsoft email_verified is not required for this flow. Name claims remain optional and only prefill the existing editable name form.

The personal tenant must be 9188040d-6c67-4c5b-b112-36a304b66dad. The exact callback application is greenwhitefamily.com/api/auth/callback/cloudflare-microsoft, restricted to the Microsoft IdP. Register the provider redirect URI as https://loewfi.cloudflareaccess.com/cdn-cgi/access/callback . Keep Microsoft disabled until the authenticated provider test shows the stable claims and the app release passes its integration/QA checks. Secrets remain in the secure Microsoft/Cloudflare interfaces.

Microsoft documents oid as an immutable object identifier, tid as tenant identity and name as display-only. Email remains a mutable suggestion. [ID-token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)

## Protection and retention

The ten-minute pending proof is bound to an HttpOnly Secure SameSite=Lax host-only cookie. It stores a stable identity key, display-name/email suggestion, explicit code destination, CSRF nonce, code generation and HMAC digest. It stores no raw Microsoft token or email code. POST mutations require exact Origin and a CSRF header. Code confirmation is bound to the email and generation displayed in that tab; stale tabs must refresh and reconfirm.

Only three code guesses are reserved atomically, including concurrent requests. Resends have a one-minute cooldown, three-per-proof cap and separate email/subject rate limits. All codes remain within the original ten-minute proof expiry; the UI shows remaining time and near-expiry sends require restarting. Failed delivery is not presented as successful. Cancellation and consumption remove the proof; expired proofs are deleted on the next proof creation. Expiry is an access-control deadline, not a guarantee that idle database rows are physically purged at exactly ten minutes.

Final account creation/linking is an atomic D1 batch. Deterministic Microsoft account IDs prevent concurrent duplicate links. Existing unverified GW accounts are not silently activated; they must use the ordinary email sign-in recovery path first. Ambiguous existing Microsoft ownership fails closed. No membership, role or admin capability is created or upgraded by this flow. Global automatic account linking remains disabled.

## Release checks still required

Offline synthetic SQLite/controller/client tests are evidence for business logic, not a live authentication acceptance test. Run the dependency-backed microsoft-access.test.mjs against the canonical Better Auth/JOSE versions, the full existing auth/session/member-policy tests, frontend build and the approved remote browser QA route before release. Check actual personal-account claims, live code delivery only with approval, existing-account consent, mailbox change, resend/failure, expired/cancelled/back navigation, two tabs, repeated clicks and returning identity login. No local browser installation or execution was used.

## Reversible integration

This packet is layered after the first provider-preparation packet. Apply only the exact fragments to shared auth.mjs/auth-providers.mjs/react-app.jsx. The App bootstrap routes the dedicated verification view before existing-session UI, so a prior signed-in session cannot hide the confirmation screen. No schema changes are needed; verified auth tables already exist.

Rollback by keeping AUTH_MICROSOFT_ACCESS_ENABLED false and reversing the second packet's fragments, then removing its unreferenced new modules/tests. This returns to the unactivated first packet. Do not remove accounts already linked after a later authorized release without a separately reviewed recovery plan. Google and Yahoo paths are unchanged by this second packet.
