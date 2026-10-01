# Onboarding and guest accounts

## Plan

1. First launch shows language, appearance, account choice, then explicit Terms acceptance. Preserve preference setup for later sign-ins.
2. Offer create account, sign in, and guest mode. Hold credentials only in component memory and send an authentication request only after Terms acceptance.
3. Guests can earn points and contribute. Upgrading uses the same identity and preserves contributions; the server owns this guarantee.
4. Remove account-page filler. Show the username/guest label, points, upgrade form when needed, reward history, and account actions.
5. Test the onboarding transition and authentication boundary, then run lint/typecheck. Have the parent perform a separate review and device checks.

## Documentation consulted

- Expo SDK 57 reference, Expo llms index, Expo Router authentication/protected routes.
- React Native TextInput, KeyboardAvoidingView, and Modal documentation.

## Implementation

- Replaced the welcome form with a four-step sequence. Language and appearance are shown separately; create account, sign in, and guest actions all open Terms before authentication.
- Added a tested onboarding action boundary that rejects unaccepted Terms and invalid credential input, normalizes usernames, and leaves passwords unchanged.
- Added `AccountContext.guest`; the server returns a real contributor identity without requiring username/password. The existing protected routes accept a guest profile.
- Added a guest-to-account upgrade form that uses the same registration contract/session. Removed account-page filler and collapsed reward rules/history.
- Preference completion is remembered. Passwords remain in component memory and are cleared after success/back navigation; no password persistence was added.
- Terms mention that guest progress depends on this device until the user creates an account.
- Follow-up security review found old cached Terms could trap users at save time. Protected routes now require the current Terms version and send old profiles to a renewal screen; login forwards explicit acceptance to the server.
- Independent UI review found guest mode needed an existing-account sign-in path. Added a form toggle that signs in without requiring account deletion, with a concise points-transfer explanation shown only for that choice. Reward history is keyed by account ID during switching.

## Review

- Six onboarding tests pass: first launch vs returning sign-in, stale Terms routing, Terms gating for all three account choices, no synthetic guest credentials, username normalization/password preservation, and rejected invalid input.
- A real account-component workflow test verifies guests can choose existing-account sign-in, preserve the password/normalize username, and do so without registration or guest-data deletion.
- Full TypeScript check passes. Scoped lint passes; an initial full lint run found only an in-progress wizard issue, reported to its author.
- Independent parent review and device flow checks are still required. Backend guest upgrade/point preservation is tested by the backend task.
