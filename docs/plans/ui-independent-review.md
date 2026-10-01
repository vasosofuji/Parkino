# Independent UI review

Reviewer: progressive-entry agent, reading onboarding/settings/camera work owned by other agents.

## Reviewed

- Language → appearance → login/signup/guest → Terms ordering, including current-Terms guards and existing-account consent renewal.
- Username normalization, password input, API errors, and screen transitions after authentication.
- Settings category navigation and removal of reminder marketing copy from the main settings list.
- Custom photo-source popup, camera permission recovery, offline camera availability, explicit iOS modal dismissal before camera presentation, and sign upload/review entry.
- Guest upgrade and account recovery affordances.

## Findings

1. **Guest-to-existing-account path missing — fixed and rechecked.** Initially Account allowed creating a new account but hid Sign out for guests, so an existing username could not be recovered without deleting the guest session. The onboarding owner added an explicit existing-account sign-in mode with a guest-points transfer explanation. Rechecked the real component path and account-bound rewards cache; no further blocker found.

No additional blocking issue found in the reviewed Terms order, settings grouping or camera permission flow. The photo option currently takes one extra tap to open the source popup; reducing that is a usability improvement rather than a blocker.

## Rewards/backend/map review

Reviewed cosmetic schemas, eligibility, both account stores, migration permissions, original-contributor query, catalog enrichment and all three map renderers. No blocker found. The API accepts only known palette/accent values and computes unlocks from server reward records; a client cannot select another account or submit points. Guest upgrades retain the same account ID, deletion removes cosmetic records, and edits to another driver's pin cannot transfer its accent. Catalog accents remain dependent on current eligibility and original creation ownership.

Map accents change a small border/outline while availability and selection remain distinguishable. Web and native Leaflet now move only the GPS marker/accuracy circle for position-only updates, without rebuilding parking overlays or calling the API.

Independent execution: 18 onboarding, photo-service and SQLite/Postgres cosmetic tests pass. Source review and tests do not replace the parent phone visual checks or real GPS field measurements.
