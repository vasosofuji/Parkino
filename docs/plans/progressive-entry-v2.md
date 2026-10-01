# Progressive parking contribution flow

## Plan

- Open Details & update at a direct choice between a sign photograph and manual entry. Keep navigation on the map preview only.
- Share one manual wizard between new pins and existing parking. Choose Simple (zone, price/free) or Detailed (zone, price/free, total/free spaces estimate, perimeter).
- Save each completed step independently. Open the next step while its predecessor saves; preserve completed writes if the user leaves. Retry failures without creating duplicate pins or repeating successful operations.
- Keep wizard state mounted during map drawing and notification interruptions. Enable entry and photo selection without depending on a possibly stale catalog connection flag.
- Validate prices/counts before writes, preserve optional skips, and use existing authenticated mutation APIs.

## Review checklist

- A simple contribution never demands a name, capacity or boundary.
- A photo contribution never demands manually entered label/price.
- A late failure cannot roll back earlier saved steps; retry preserves the new place ID and already completed sub-writes.
- Capacity is saved before a free-space estimate and free spaces cannot exceed it.
- Saving a boundary returns to the same wizard and completed details survive cancellation.
- Focused persistence tests, TypeScript and Expo lint pass; record actual validation below.

## Implementation and review

Implemented `ManualParkingWizard` with direct Simple/Detailed choice, independent per-step writes and a shared `createProgressiveEntry` writer. New parking creation retains the same request ID on retry. Local drafts store pending intent before network writes, scoped to the profile ID; both the coordinate and created-place aliases are recoverable. Successfully completed sub-writes are snapshotted so retrying a failed free-space report does not repeat its saved capacity update. API writers capture the original bearer and session generation, preventing later steps from switching account.

The existing Details sheet now begins with photo/manual choices and has no navigation button. Boundary editing hides the mounted wizard and returns a geometry for the wizard to save. Identical geometry returned by catalog refresh cannot cause an autosave/refresh loop. Source selection and manual input do not depend on the cached `connected` flag.

Independent critic: onboarding agent identified missing Back/correct controls and stale free-space retry timestamps. Both are fixed. Back retains already saved values and lets permanently rejected data be corrected. Availability has a separate observation time; editing another field cannot renew it, and retry after 15 minutes requires a current estimate or omission.

After a new physical parking's sign is confirmed, the user can finish immediately or add optional spaces/perimeter. That flow starts at spaces with the already-created place ID, preserves the sign details and never asks for zone/pricing again. iOS waits for review dismissal before showing this follow-up. Existing sign edits and tariff zones can finish immediately.

Validation: TypeScript and Expo lint pass. Eleven focused persistence tests cover partial save failure, serialization, idempotent pin retry, reopening snapshots, valid zero values, impossible counts, account-scoped drafts, pending-write/input merge, alias cleanup, stale availability and post-sign updates to the same pin. Two actual-API-module tests prove queued steps cannot cross a sign-in change. Live phone visual verification remains with parent integration.
