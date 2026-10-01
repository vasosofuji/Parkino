# Arrival reminders implementation plan

## Scope and contract

- Reuse one stationary arrival detector for the foreground and background, with a 10-second dwell, accurate fresh fixes, driving rejection, surveyed polygons including holes, and a six-hour per-place cooldown.
- Persist background opt-in, the latest parking catalog, detector state/cooldowns, and the pending reminder locally. Keep notification payloads to an internal place identifier; do not upload a location history.
- Register the Expo TaskManager location task at module scope. Request foreground, background, and notification access only after an explicit opt-in. Use an Android foreground service notification while monitoring.
- Export `BackgroundArrivalSettings` for the settings screen, and `disableBackgroundArrival` for logout. Keep `useArrival`'s existing return contract and restore a notification-selected place through that hook.
- Handle cold and warm notification responses in the root layout, route to `/`, and consume the persisted pending prompt. Ignore unrelated notification data and expire old reminders.
- Provide a web fallback with reminders unavailable, while keeping foreground arrival detection available.

## Implementation sequence

1. Read SDK 57 Location, TaskManager, Notifications and Expo Router documentation; install SDK-compatible modules with `npx expo install`.
2. Add serializable detector state and pure reminder transition functions with deterministic tests.
3. Implement storage, native task, permissions, cleanup, notification listener, settings UI, and hook integration.
4. Configure native capabilities via Expo config plugins. Do not hand-edit generated native folders.
5. Run focused arrival/reminder tests, lint, and typecheck; fix failures and record review findings.

## Platform limits and device verification

The 10-second dwell is evaluated from location fixes, not a guaranteed background alarm. Android/iOS battery policy and update delivery can delay reminders. Force-stopping the app stops monitoring; some Android vendors also stop it when swiped from Recents. A new development/preview build containing the native modules and permissions is required, and Expo Go is not a valid background test target.

Device checklist: opt-in permission order; deny/allow paths; remain stationary inside a surveyed parking; background the app; tap the local reminder; verify the same arrival popup; dismiss and verify cooldown; leave/re-enter; opt out and log out; verify service/notifications stop. Test iOS separately from Android.

## Sources

- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/llms.txt
- https://docs.expo.dev/versions/v57.0.0/sdk/location/
- https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/router/basics/navigation/

## Validation

- Installed `expo-task-manager` and `expo-notifications` with SDK 57's `npx expo install`.
- `npx tsx --test tests/background-arrival.test.ts tests/arrival-and-prices.test.ts`: 13 tests passed. Coverage includes 10-second dwell; speed, accuracy and stale-fix rejection; polygons and holes; restart persistence; duplicate suppression; exact notification matching and expiry; batched locations with a departure; and the existing price/location API behavior.
- `npx expo lint`: passed without warnings. `npx tsc --noEmit`: passed after other agents' shared account contracts settled.
- `npx expo export --platform web --output-dir .expo/arrival-web-review`: passed. Metro recovered automatically from an unreadable old cache. Web does not load native task/notification modules.
- Review fixes: detector snapshots copy their candidate state; a deferred location batch ending outside the parking area cannot notify; expired local notifications are removed; opt-out also removes arrival notifications still in the tray; logout clears local arrival state; existing APKs without the new modules show an update explanation instead of crashing.
- Root notification handling waits for account restoration and the router, then navigates to the map. Restored prompts survive a missing current GPS fix and dismiss explicitly. All notification data is matched against the local pending reminder; no arbitrary URL routing.
- The arrival hook exposes `arrivalFromNotification` so the map can prioritize notification taps over pre-existing panels while preserving drafts. Tariff zones with already-known prices are excluded from arrival questions; real parking facilities inside them still ask about free spaces.
- Native device validation is being coordinated by the parent agent using a separately installed test build. Physical background delivery and iOS behavior are not claimed verified by the unit tests or web export.
- Android permission-transition fix: save the opt-in and return a pending state when the app is backgrounded; resume starts the service after the next active event. Recheck activity and the current preference generation immediately before native start. A late logout/opt-out cancels the outstanding request and queued cleanup stops any service that raced it. Android's foreground-service/background rejection also becomes pending rather than exposing its raw error. There is no foreground wait or indefinite busy state.
- `npx tsx --test tests/foreground-arrival-start.test.ts tests/background-arrival.test.ts`: 10 tests passed, covering background deferral, the activity/opt-out race during native status lookup, Android's native rejection before JS receives AppState, retry on return, and cancellation while start is outstanding. Lint and typecheck passed after this fix.
- Parent's physical Android test verified that a normal retry starts a foreground `LocationTaskService`, the service remains active after Home, sign-out removes the foreground notification/service, and signing back in recovers the same account while reminders stay off. The permission/Home race fix awaits the final device rebuild and retest.
