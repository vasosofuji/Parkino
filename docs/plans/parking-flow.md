# Parking contributions and digital signs

## Implementation plan

- Replace native photo-source alerts with the app's themed popup and explicit camera/gallery actions.
- Start every new parking contribution with manual entry or sign photo. Keep a quick pin path and optional detailed path with facility type, map boundary, total capacity, and estimated current free spaces.
- Keep contribution drafts mounted while the user draws the boundary; drawing an outdoor parking perimeter must not convert it to a tariff zone.
- Upload signs into a review workflow. Show the source image beside a digital sign preview; require explicit confirmation, with editable fields and a manual fallback if AI is unavailable or uncertain.
- Render confirmed digital signs for parking and their containing signed zones; show capacity and time-limited availability counts.

## Interfaces

Parent owns domain and API contracts: optional contribution capacity/freeSpaces; confirmed sign metadata; `api.confirmSign(photoId, info)`; authenticated own-upload metadata for restoring pending reviews.

## Validation

Expo SDK 57 was verified in package.json. Read the matching Expo SDK reference, image picker reference, and Expo LLM documentation index before changes. Run project lint and TypeScript checks after implementation, then review interaction/state paths and fix findings. Physical-camera/AI accuracy depends on the attached device and configured AI service; distinguish those checks from static verification.

## Results

- Implemented the themed camera/gallery popup in `PhotoPicker` on all platforms.
- Added manual/photo entry choice and quick/detailed additions. Photo entry does not request pricing or zone data before extraction. Detailed additions include optional map boundary and count estimates. A mapped facility stays a facility; tariff zones are an explicit type.
- `MapScreen` keeps `ProposalSheet` mounted while drawing, including cancel/retry paths. Finishing a boundary updates only geometry and preserves the original pin, chosen photo, and form state.
- Added `SignReviewSheet`: uploaded photos open a digital preview and require confirmation. Reading failures and pending processing permit manual correction. Corrected information gets a fresh preview and a separate confirmation before publication. Unconfirmed own uploads remain reviewable from photo thumbnails.
- Added `DigitalParkingSign` to parking previews/details, including inherited confirmed zone signs. Sign text, prices, restrictions and payment details are rendered from confirmed data.
- Added capacity editing, optional free-space counts, and nearest recently available alternatives for full parking. Arrival asks availability first and only then free/paid/skip when pricing is missing.
- Review fixes: validated optional short names, rejected following-hour prices without first-hour prices, aligned sign editor lengths with backend schemas, and disabled relevant controls during writes.
- `npm run typecheck`: passed after integration and validation fixes.
- `npm run lint`: passed for the entire project after the account owner fixed its concurrent effect issue.
- `git diff --check` over owned tracked files: passed.
- Physical Android camera, AI extraction accuracy, notification handoff and end-to-end visual verification remain with the parent/device validation loop; no claim of those checks is made here.
- Independent review fixes: background notification arrivals now take priority over existing selected pins/dialogs and retain the new-contribution draft and sign-review state. Missing-price/full parking followup includes a direct action to find nearby spaces. Blank manual sign confirmations are rejected before preview.
- Read React Native 0.86 Modal documentation and made the native iOS photo picker and sibling sign-review transitions wait for actual `onDismiss`; Android/web retain immediate source actions. `Sheet` now forwards optional `onDismiss`/`onShow` callbacks.
