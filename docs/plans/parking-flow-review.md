# Independent parking flow review

Reviewer: background-arrival agent. Review scope: current shared parking UI implementation, modal transitions, delayed sign extraction, contribution drafts, notification return.

## Findings sent to the implementation agents

1. **P1 — A warm notification could open the app without its question.** `useArrivalNotifications` navigated to the existing `/` screen; selected parking, details, settings, contribution, drawing and help state remained mounted. The arrival sheet's ordinary visibility guards then hid the restored question. The arrival hook now exposes `arrivalFromNotification`; parking-flow agent is integrating priority presentation while keeping contribution drafts mounted. Test from an already selected parking, open details/settings, and an unfinished contribution.

2. **P1 — iOS native modal handoff needs dismissal sequencing.** `PhotoPicker.pick` hid the animated custom chooser and immediately called Expo's native image picker. `ProposalSheet` similarly hid its native sheet while mounting a sibling review modal; `SignPhotos` swapped view and review modals in one update. This creates a native presentation/dismissal race on iOS. Recommended a single dialog host or `onDismiss`-aware handoff; keep web picker calls directly in a user gesture. Parent and parking-flow agent informed. Device verification remains necessary.

3. **P2 — Already-priced tariff zones had a question with no useful answer.** A detected zone's title asked whether it was free, but the response buttons were hidden because pricing was already known. The arrival detector now skips tariff zones with known pricing; individual parking facilities inside those zones still ask about availability. Added a regression assertion.

4. **P2 — Reporting an unpriced parking full skipped the alternatives path.** `reportArrival('full')` opened details/alternatives only when the price was known. With missing pricing it opened the follow-up, and sharing/skipping that follow-up dismissed the flow without nearby alternatives. Recommended retaining the full result and offering nearby spaces during or after that optional follow-up. Parking-flow agent informed.

## Positive checks and constraints

- The new contribution component remains mounted when drawing its boundary. Pin, mode, form fields and selected photo survive drawing and canceling drawing.
- `SignReviewSheet` maintains manual fields and corrected preview separately from polled AI data; late extraction does not replace manually edited fields.
- Unconfirmed photos remain reviewable from their owner's photo strip. Confirmation publishes the checked sign; the server retains confirmed information separately from later AI results.
- Notification response matching accepts only the locally persisted reminder's exact place and creation time. Root handling waits for restored account/router state. Signed-out/invalid-session cleanup is owned by the account agent.
- A notification-restored question remains available without a current GPS fix, allowing the answer after opening the app.
- Background delivery timing and native/iOS presentation require device testing. Unit tests and web export do not prove those behaviors.

## Verification after arrival fixes

`npx tsx --test tests/background-arrival.test.ts tests/arrival-and-prices.test.ts`: 13 passing. Latest `npx expo lint` and `npx tsc --noEmit`: passing at review handoff. Parent coordinates physical Android testing.
