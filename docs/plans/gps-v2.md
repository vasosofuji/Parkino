# Live location and request pacing

## Plan

- Request high-accuracy foreground fixes at a one-second Android minimum with distance filtering disabled; iOS uses native foreground delivery. Preserve the separate opt-in five-second background task.
- Accept current walking/driving fixes even when accuracy temporarily worsens. Briefly hold only extreme coarse drift; never freeze the last precise dot for twenty seconds.
- Stop foreground subscriptions on inactive/background transitions, restart on return, and keep ten-second stationary arrival detection separate from marker rendering.
- Position callbacks update local state only. Catalog traffic stays on a 30-second active-app poll; coalesce overlapping polls and retain a single follow-up read when a completed write lands during a fetch.
- Test changing accuracy, stale/duplicate positions, delayed arrival completion and request coalescing. Run lint/typecheck and ask an independent agent to criticize the changes.

Docs checked: Expo SDK57 location reference (`watchPositionAsync`, `LocationOptions`, foreground-only subscription semantics). `timeInterval` is an Android minimum rather than a cross-platform guarantee.

## Implementation and verification

Foreground Android now requests one-second high-accuracy fixes. Moderate accuracy degradation still moves the marker immediately; extreme coarse drift is held for no more than five seconds. Duplicate timestamp/accuracy events are ignored. Precise stationary requirements for adding parking and arrival prompts remain unchanged.

Fixed a faster-fix race: an arrival saved to local storage is evaluated against the latest stationary position instead of being discarded whenever its original timestamp is no longer the latest. Foreground subscriptions stop on both inactive and background transitions. The opt-in background task remains at five seconds.

Catalog refresh has no location dependency. Automatic 30-second polls run only while active; overlapping polls share one request and mutations during a poll cause one later read. The coordinator releases its running marker inside the pump so a mutation arriving during promise settlement cannot join an already completed read.

Validation: 19 GPS/polling/background tests pass, including an actual-hook dependency harness delivering 60 one-second moving positions without any API request or extra catalog cache writes, delayed arrival completion, reduced accuracy movement, subscription cancellation and overlapping request behavior. Combined with progressive-entry and native startup tests, 31 focused tests pass. TypeScript and Expo lint pass. Actual satellite cadence and battery consumption still depend on device/OS and need field measurement.

Independent review by the onboarding agent found no additional confirmed issue; see `gps-independent-review.md`. The map-renderer owner separately split GPS marker updates from parking overlays to keep one-second fixes cheap.
