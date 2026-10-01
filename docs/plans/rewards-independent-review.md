# Independent rewards review

## Scope and method

The onboarding/settings worker independently reviewed the Rewards screen, profile-driven theme lifecycle, account guest upgrade and existing-account switch, consent-protected route, and the palette foreground/background pairs. The progressive-entry worker separately reviews server entitlement, original-contributor ownership and map renderer performance. This review does not substitute for native visual/device checks.

## Findings and critique loop

- **Resolved: insufficient dark-palette foreground accent contrast.** The same `green` token served white-button backgrounds and small foreground text. Ocean foreground text measured 2.95:1 against paper and 2.19:1 against mint; Plum measured 3.18:1 and 2.32:1. The affected surfaces included account contribution-point rows, community status/progress, and coverage zone codes. Existing tests checked ordinary/muted text and white button labels but missed these foreground uses. Reported to the author and parent before editing the build snapshot. The author implemented a separate `accentText` token while preserving button backgrounds and status semantics, with tests against paper/mint/input. Independently verified all foreground text/icon/loading uses were switched while fills/borders remained unchanged. The lowest new-palette foreground ratio is now 5.35:1; dark Ocean is at least 6.27:1 and dark Plum at least 6.38:1.
- No confirmed guest identity or theme lifecycle regression: cosmetics derive from the current profile and earned points, so signing into an existing account replaces guest appearance without importing guest rewards. Guest registration retains its identity and server-stored choices. Account contribution history is keyed by profile ID and cannot show another profile's cached result.
- Locked and selected tiles cannot submit; free reset remains available for nondefault cosmetics. Save failure leaves a retryable choice. The app refreshes both the account palette and public map after successful selection, and distinguishes a saved choice from a subsequent refresh failure.
- Appearance mode remains device-persistent; earned palette is account-owned. Provider order gives ThemeProvider the AccountContext and system mode follows the native automatic-appearance configuration. Palettes preserve success/full/error meanings.

## Verification

Independently ran `node --import tsx --test tests/rewards-cosmetics.test.ts tests/account-guest-login.test.ts tests/onboarding.test.ts`: **12/12 passed**, both before and after the contrast correction. These exercise SQLite and PostgreSQL entitlement/ownership/upgrade behavior, consent renewal, explicit guest sign-in without deletion, onboarding Terms gates, and now the foreground accent contrast. Independently ran `npx expo lint` and `npx tsc --noEmit` after the correction: both passed. No remaining confirmed UI blocker was found in this scope. Parent performs the native build and device check.

## Photo follow-up cross-review

Reviewed the optional post-sign spaces/perimeter flow: the confirmed physical parking ID is reused, the wizard starts at spaces without repeating label/pricing, and the iOS handoff waits for sign-review dismissal. No additional confirmed source-level blocker was found. Native sheet transition and camera behavior remain part of the parent's device validation.
