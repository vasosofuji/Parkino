# Guest contribution and API security, version 2

## Plan

- Add a guest identity only after current Terms acceptance; no public username or password required. A guest profile is separate from named profiles, retains the existing session identifier, and accrues the same contribution rewards.
- Upgrade guest identity atomically through the existing registration flow, retaining ownership and points; do not create a replacement user or reserve a synthetic public username.
- Review authentication normalization, password derivation, token rotation/revocation/expiry, concurrent registration, and generic login errors.
- Review input limits, parameterized queries, sign ownership, upload caps, and IP plus authenticated-user limits. Add bounded rate-limit memory and password-work concurrency controls where missing.
- Keep new tables in the private `parkskopje` schema, enable RLS, revoke public/client role access, and grant only the server role. Generate the migration with the Supabase CLI.
- Verify guest consent, contribution access, upgrade/reinstall recovery, reward retention, concurrent collisions, abuse limits, and migration access controls against SQLite and PGlite. Run lint and typecheck and record remaining deployment limits explicitly.

## Documentation checked

Read the Supabase skill, current changelog and Data API security guide; Node crypto documentation; and the Fastify rate-limit plugin documentation. This app uses custom opaque bearer sessions, not Supabase Auth JWTs.

## Implementation and self-review

- Added `guest_profiles` with a private-schema, CLI-generated migration. Guest entry records current Terms acceptance; it has no public username. Both stores return `Profile.guest` and preserve the canonical session and rewards through an atomic named-account upgrade.
- New public named registrations require a password. Guest-to-password-only escalation is blocked because it would save an empty username. Concurrent upgrades revalidate the token and canonical profile under the same database transaction; losing upgrades retain the guest state.
- Preserved salted scrypt (`N=32768,r=8,p=3`) and constant-time key comparison. Capped concurrent derivations at four and reject oversized password inputs before derivation. Authentication payloads are strict and bounded; wrong/missing accounts retain the same login response. Opaque bearer values are bounded and stored as SHA-256 hashes in the database; named bearer sessions expire and logout revokes the selected session.
- Added aggregate process/IP budgets that still apply when route limits override defaults, a per-account write budget, and per-account upload/contribution limits across changed IPs and login tokens. Existing sign byte/signature checks, per-place photo cap, ownership checks and parameterized SQL remain in force. Sensitive responses use `no-store`; responses use `nosniff`; requests have bounded body sizes and network timeouts.
- Current Terms are checked before contribution writes. Logout/account deletion remain possible without reaccepting Terms.
- Follow-up review added explicit current-Terms consent to login. A valid current consent pair renews an older named profile; legacy login payloads still authenticate but retain the contribution write gate until renewal. SQLite/PGlite tests cover partial, stale and absent consent.
- Verification: 20 focused account/guest/contribution tests passed on SQLite and PGlite. After updating older tests for authentication-first validation and the tighter username lookup limit, the complete suite passed **111/111**, with **lint and typecheck passing**. Migration tests confirm guest-table RLS and no `anon`/`authenticated` access while the server role has access. `git diff --check` passed for owned files.

## Remaining operational boundaries

- Limits are process-local and reset at restart; use a shared limiter before scaling to multiple API processes. These controls reduce request abuse, not distributed denial of service or fabricated crowd reports. Username availability is deliberately public and therefore allows name enumeration.
- Guest credentials remain device-bound until the user upgrades. Named accounts have username/password recovery but no email/password-reset channel in this scope.
- No hosted migration, advisor run or deployment was performed here. The parent must apply the checked migrations and verify the hosted server role and schema before shipping.
- Independent client critique sent to parent: `redirect: 'error'` is not a verified native React Native redirect guarantee because native fetch is backed by XHR; a public-endpoint guard should normalize trailing dots and reject private/loopback ranges, not just three hostnames. Do not claim absolute security from passing tests or client fetch options.
