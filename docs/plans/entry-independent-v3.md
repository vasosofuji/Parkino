# Independent entry review, version 3

## Scope

Read-only review of ProposalSheet, PhotoPicker, ManualParkingWizard, SignPhotos, SignReviewSheet, Sheet header registration, progressive entry serialization and durable draft handling. Focus: direct photo source selection, required manual details, autosave/draft continuity, iOS modal transitions and map geometry returns.

## Confirmed findings

1. **Fixed by entry owner:** the after-sign optional-details offer exposed a Back action that only reset `mode`, leaving `afterSign` unchanged. The action appeared inert. ProposalSheet now omits the parent Back action for that offer; its detail wizard supplies its own contextual action.
2. **Fixed by entry owner:** the offline SignPhotos component test lacked a `useRef` mock after the component began using refs. Full suite 160/161 failed only for that harness. The owner added the mock and reported 24 focused entry/photo tests passing.
3. **Sent to entry owner for repair:** after photo creation succeeds but photo upload fails, choosing Back then manual entry created a new writer without passing the already-created parking. The fallback could publish a second pin. The manual branch must reuse `followupPlace`/`savedPlace` whenever `savedId` exists, with a regression test for photo-to-manual fallback.

## Checked behavior

- Manual price requires a first-hour value or the explicit free action; zero is retained. Detailed counts require both total and current available spaces, with free <= total.
- Completed operations save through a serialized, account-bound writer; durable intent precedes network work and aliases retain the created parking ID.
- Old free-space drafts are invalidated; missing mandatory data prevents a restored `done` step from falsely completing. Detailed geometry is required, while an unchanged imported perimeter may retain holes.
- Source selection is inside the active popup, avoiding the earlier source-modal-dismiss/native-picker race. The native picker remains a direct user gesture on web.
- iOS source-to-review and review-to-optional-details transitions wait for dismiss events. Review confirmation remains explicit; extracted data is not published automatically.
- Sheet header Back registration uses the latest handler and unregisters on form unmount.

## Limits

No source edits were made in the entry agent's files. iOS native picker/presentation timing and Android process recreation still need the parent's device validation; source inspection and pure tests do not replace those checks.
