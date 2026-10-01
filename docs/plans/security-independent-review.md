# Guest/authentication/security review

Reviewer: onboarding/settings agent. Backend source review was read-only; onboarding integration fixes were subsequently authorized by the parent.

## Scope and plan

Review guest creation and upgrades, password/token handling, account ownership, Terms enforcement, rate-limit placement, database grants, and client session races. Run the existing dual-store security/account tests and report concrete defects to the author.

## Finding and correction

**Current Terms could not be renewed through the UI.** A named account with an older `termsVersion` could sign in after accepting the welcome modal but kept the old server version. Existing cached profiles also entered protected screens based only on profile presence. Every write then returned 403 with no renewal path.

- Reported to the parent/backend author.
- The backend author added explicit login consent fields and only updates consent when those fields are supplied.
- The onboarding task now forwards explicit acceptance for login, checks `hasCurrentTerms` in protected routing, and shows a dedicated consent renewal route for cached old profiles. Renewal retains the same identity and points using the existing guest-consent endpoint's named-account branch.
- Six onboarding tests cover preference entry, old-consent gating, all three Terms-gated authentication modes, normalization, password preservation, and invalid input.

## Checks completed

- Passwords use salted scrypt with a bounded concurrent-work gate; tokens are random and stored as hashes. Invalid account names pay dummy password derivation cost and get the same login error.
- Username handling normalizes Unicode, validates the allowed character set, and uses bound SQL parameters. Passwords are not silently trimmed.
- Guest consent uses a separate private table. Guest upgrades retain the contributor/session ID, contributions, and points. Named profiles cannot be downgraded by the guest endpoint.
- SQLite transactions and PostgreSQL session-row locks protect concurrent upgrades and account securing. Authentication revalidates tokens after asynchronous hashing.
- Mutations require a valid session and current Terms in the production server. Account-bound write/upload limits supplement IP and process budgets. Login has an additional normalized-username budget across IPs.
- Request bodies, geometry size, photo size, outbound geocoder time, SQL statement time, and password jobs are bounded. Error responses do not expose database internals.
- Database TLS verification stays enabled. Guest tables have RLS and explicit revocation from public client roles; the server role has access through the private schema.
- Sensitive authenticated responses get `Cache-Control: no-store`; public sign image caching is intentional. Map labels use text nodes for user content.
- Existing tests verify account recovery, ownership, unique salts, expiry/revocation, guest upgrade rollback, concurrent upgrade rejection, private grants, per-account resource budgets, and stale credential-response races.

## Validation and limits

25 focused authentication, guest security, session-lifecycle, and onboarding tests passed during this review (before the backend's final login-consent test additions). No further confirmed backend vulnerability was found in this scope. This is not a penetration test or a guarantee that every vulnerability is absent.

The final login-consent cases subsequently passed against both SQLite and PostgreSQL in the rewards suite: omitted consent keeps the old version, malformed/partial consent is rejected, and explicit current consent renews it. The onboarding, guest existing-account sign-in, and rewards suites together passed 12/12 in the independent follow-up.

Rate limits are process-local and require a shared store if the API scales to multiple processes. Deployment proxy trust must match the actual provider; the checked-in Render config specifies trusted local proxy ranges. Review did not inspect or change remote production configuration.

Supabase changelog/API-security guidance and Node crypto documentation were consulted. No migrations were applied by this reviewer.
