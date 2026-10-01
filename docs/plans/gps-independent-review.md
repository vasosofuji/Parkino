# Independent GPS and refresh review

Reviewer: onboarding/settings agent. Source review was read-only.

## Scope

Reviewed native/browser location adapters, GPS freshness and accuracy selection, useArrival lifecycle handling, foreground/background arrival persistence, and catalog refresh coordination.

## Findings

No additional confirmed defect found in this pass. The new high-frequency position callback updates local location state; it does not call the parking API. Catalog caching remains tied to catalog changes. Background transitions remove the foreground watch and foreground activation starts a new watch. Late persisted arrivals are checked against the latest valid position before showing a prompt.

Ordinary catalog polls coalesce; mutation-triggered refreshes request one newer read when an older read is already in flight. Automatic polling is paused while the app is inactive. The location marker accepts normal GPS accuracy degradation and reports it as approximate, while contribution/arrival gates retain stricter accuracy requirements.

## Verification

21 location, refresh, background-arrival and foreground-start tests pass. The live-GPS hook harness also verifies frequent local fixes without API/catalog traffic, late arrival persistence, and departure handling. Full lint/typecheck pass at this review point.

Device movement, battery usage, OEM GPS behavior, and background notification delivery remain physical-device checks. A one-second requested Android interval is not an operating-system delivery guarantee.
