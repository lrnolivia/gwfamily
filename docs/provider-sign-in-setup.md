# Microsoft and Yahoo sign-in preparation

Status: application-side preparation only, 2026-10-06. No provider registrations, credentials, Access applications, policy changes, Worker configuration, live sign-ins, database migrations, or messages were made by this slice.

## Verified current state

The production Worker is `gwfamily`. It exposes Google through an existing Cloudflare Access callback application, plus email-code sign-in. No Microsoft or Yahoo IdP is configured. Google's current non-secret IdP configuration has no forwarded custom name claims. Existing backend code used the email prefix as the initial name; this slice removes that guess. The editable enrollment form and organizer approval remain in place.

## Design

Each provider gets an exact callback path, audience, state cookie and account namespace. Google's callback and account namespace are preserved. A shared Access audience would require a neutral chooser or an independently verified actual-IdP lookup; a button label or requested provider cannot establish which provider authenticated the user. This slice instead isolates callbacks and preserves disabled automatic account linking.

Microsoft and Yahoo capabilities require a valid distinct audience and an explicit `ENABLED=true` flag set only after setup and authorized end-to-end checks. These flags are release gates, not independent proof that a provider is configured correctly. Disabled providers produce neither a button nor a registered Access bridge. Public config includes labels/modes only, never client credentials or audience IDs.

## Yahoo secure setup

1. In Yahoo Developer Apps, create a Confidential Client named GW Family. Homepage: https://greenwhitefamily.com . For the Access integration, the exact Redirect URI is https://loewfi.cloudflareaccess.com/cdn-cgi/access/callback . It is not the homepage or the GW callback path.
2. Select only OpenID Connect, Email and Profile. Review the displayed developer terms before submitting. Account registration and secret creation/entry are user-secure steps; never send a client secret in chat, a screenshot, or a source file.
3. Read the current discovery document at https://api.login.yahoo.com/.well-known/openid-configuration . In Cloudflare's Generic OIDC integration, use its authorization endpoint, token endpoint and JWKS URL. Request `openid email profile`; email claim is `email`; forward `name`, `given_name`, `family_name`, `email_verified` as custom claims. Do not request Mail, Contacts, Fantasy Sports or refresh-token access for this feature.
4. Protect exactly greenwhitefamily.com/api/auth/callback/cloudflare-yahoo with a self-hosted Access application restricted to the Yahoo IdP. Its allow policy must authenticate through that IdP; do not configure a bypass or service-token policy. Keep the existing Google callback untouched.
5. After an authorized test proves boolean `custom.email_verified=true`, the correct audience, readable display-name claims, secure callback state and pending membership, configure that audience as `AUTH_YAHOO_ACCESS_AUD` and set `AUTH_YAHOO_ACCESS_ENABLED=true`. Prefer preview first. The audience is non-secret; the Yahoo client secret belongs only in the secure provider configuration.

Yahoo’s live discovery advertises email_verified, name, given_name and family_name. Actual Access forwarding must still be checked before enabling. [Discovery](https://api.login.yahoo.com/.well-known/openid-configuration)

## Microsoft secure setup and verification boundary

Use a normal Microsoft app registration with personal accounts enabled. Entra External ID is not required merely to offer Outlook/Hotmail sign-in. For this Access slice choose personal accounts only, with the `consumers` discovery document at https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration and the same Cloudflare redirect URI above. Do not accidentally select a single organization or the `organizations` authority. Request `openid email profile`, not directory, mail or calendar permissions.

Configure a Generic OIDC IdP from discovery and forward `tid`, `name`, `given_name`, `family_name`, `email_verified`, `verified_primary_email`, and `verified_secondary_email` when supported. Create an isolated callback application for greenwhitefamily.com/api/auth/callback/cloudflare-microsoft restricted to that IdP. No setup has been performed.

A Microsoft email claim alone is insufficient evidence of mailbox ownership. The prepared Access verifier accepts only the personal-account tenant `9188040d-6c67-4c5b-b112-36a304b66dad` plus either a strict boolean `email_verified=true` or an exact case-normalized match in a signed forwarded authoritative verified-email array. A domain-verification claim, username or preferred_username is insufficient. These checks are especially important because GW's initial owner enrollment is email-based.

IMPORTANT: the current personal-account registration has not been created or tested. The consumers discovery document does not list email_verified or authoritative verified-email arrays; requesting a claim does not ensure it will be emitted. Do not turn on `AUTH_MICROSOFT_ACCESS_ENABLED` merely because discovery or consent succeeds. First observe an authorized real sign-in's supported claims securely without recording tokens. If usable verification proof is unavailable, leave this bridge disabled. A complete alternate route requires a separate email-OTP ownership challenge bound to the pending Microsoft subject, then explicit linking to a freshly authenticated GW account. Creating an unverified OAuth account and later verifying its email is unsafe: it can create a pre-account-takeover path. That linking/challenge workflow is not implemented in this slice. Existing email-code sign-in remains available.

The pre-existing native Microsoft option is separately gated by `AUTH_MICROSOFT_NATIVE_ENABLED=true`, explicit `MICROSOFT_TENANT_ID=consumers` or `common`, both client credentials, and Better Auth's required email-verification option. It is an alternative requiring its own callback and validation; do not configure both modes. Common includes organizational accounts and is not the suggested Access route here.

[Microsoft account audiences](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types) · [Optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference) · [Better Auth Microsoft](https://better-auth.com/docs/authentication/microsoft)

## Google names

The existing Google IdP supports configurable custom claims. Add `name`, `given_name`, `family_name` and `email_verified` through an authorized secure configuration change, then test a fresh authentication. The backend reads the signed Access `custom` claims. Missing or trimmed claims leave the editable name blank; no username is invented. Existing saved names are not overwritten. Do not reinterpret old saved names as email prefixes or automatically rewrite member records.

[Cloudflare Generic OIDC and custom claims](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/generic-oidc/) · [Access application JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)

## Activation checks and rollback

Before enabling either new provider, verify in an authorized test: the selected provider is used; wrong audience, wrong issuer, forged/expired tokens and replay fail; names are editable; a missing name stays blank; same-email collisions request email sign-in rather than silently linking; new members have no family-data access before approval; no new leader/admin role is granted solely from an unverified email. Test cancellation/back navigation and repeated clicks in the canonical remote browser route. Confirm Google and email-code sign-in still work.

Fast config rollback: set the new provider's ENABLED flag false. Existing Google credentials and audience stay intact. Source rollback: reverse the surgical fragments and restore the baseline google-access module and test included in the packet, then remove newly added unreferenced modules/tests. No schema migration is required. Re-read current source before applying rollback if another release has changed it.
