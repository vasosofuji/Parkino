# Accounts and contribution rewards

## Implementation plan

Preserve the existing session ID as the contributor identity so securing an existing username and signing in after reinstall retain ownership, report history, and session age. Add password credentials separately from public profiles. Use Node's asynchronous scrypt with a unique 16-byte salt and timing-safe comparison, fresh 32-byte bearer tokens, hashed token storage, and session expiry. Passwords never enter profile/cache responses. Keep account deletion distinct from signing out.

Provide create-account/sign-in onboarding, an account screen for saving an existing username with a password, a point balance with recent activity, and settings access. Use existing Expo 57 Router and native controls. Disable background contribution reminders when signing out or deleting an account.

Award fixed server-defined points after successful contribution writes. Deduplicate ledger entries by contributor and a server-generated contribution key. Larger rewards go to boundaries, verified sign details, prices, and capacity. Availability rewards are limited to one award per parking per day. There is no client endpoint for awarding points.

## Integration contracts

- Keep `sessions.id` stable. Resolve a bearer token through `sessions.hash` or `auth_sessions.hash` with a future expiry.
- Tables: `account_credentials`, `auth_sessions`, `reward_events`, all cascading from sessions; PostgreSQL migrations are owned by the integration agent.
- `registerAccountRoutes(app, accounts)` provides login, secure-existing-account, logout, and rewards read routes.
- `accounts.award(token, eventKey, kind)` awards fixed points once per event key. Call only after validated writes succeed.
- `Profile` includes `secured` and `points`; client `api.login` and `api.secureAccount` replace the bearer token, `api.logout` clears it after revocation.

## Verification plan

Exercise account recovery and ownership preservation in SQLite and PostgreSQL, failed login and throttling, unique salted hashes, logout versus account deletion, expired/revoked tokens, duplicate rewards, and private response fields. Run the repository's typecheck and Expo lint after integration.

## Results

Implemented on SQLite and PostgreSQL. Expo 57 Router/SecureStore references, React Native TextInput docs, Node crypto docs, and Supabase security/changelog guidance checked. The existing backend uses a private PostgreSQL schema behind Fastify; this implementation keeps credentials behind that API.

- Password creation/sign-in and securing a device-only username preserve the canonical identity. Login and account creation use expiring 90-day sessions; securing an old account revokes its old device token. Signed-out users retain their account and points. Deletion removes credentials, all sessions and reward history.
- Added account and points screen, bilingual password onboarding, password visibility control, settings link and legacy-account reminder, plus a custom confirmation sheet for permanent account deletion.
- Fixed two review findings: stale 401 responses could erase new credentials, and unfinished anonymous-session creation could overwrite a recovered account. A single session manager serializes storage and invalidates only the matching token. Account context also protects state updates across profile refresh/login/logout races and disables background reminders when identity is lost.
- `tests/accounts-recovery.test.ts`: 7 passing tests covering both adapters, canonical ownership, normalized username recovery, password secrecy and salts, session expiry/revocation, logout versus deletion, duplicate points, account isolation, concurrent deletion during login, and throttling.
- `tests/session-lifecycle.test.ts`: 6 passing regressions covering concurrent creation, ordered writes, stale failures, and delayed authentication after sign-out.
- Existing `tests/accounts-postgres.test.ts` passes alongside the new recovery suite (11 tests combined). Expo lint and TypeScript checks pass after integration.

Manual phone UI verification is coordinated by the integration agent. Email-based forgotten-password reset is not implemented; the account screens explicitly explain saving the password. Existing usernames need to be secured on the current device before reinstalling. The login limiter is process-local; use shared rate-limit storage before scaling the API across multiple instances.
