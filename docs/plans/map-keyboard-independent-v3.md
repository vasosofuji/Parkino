# Android map keyboard independent review

Reviewer: entry-v3 agent. Read-only critique; implementation belongs to parking_flow. Device evidence supplied by parent: RN search blur/Keyboard.dismiss fails once RNCWebView owns Android IME focus.

## Documentation and native wiring

- Expo package remains ~57.0.26. Re-read Expo57 index, Modules API/get-started, and Android WindowInsetsController/InputMethodManager official references.
- Local module shape is compatible with SDK57. Installed Expo autolinking resolves parkino-map-keyboard and its Kotlin module classifier. Gradle plugin declarations match installed expo-blur. Queues.MAIN is documented and present in installed expo-modules-core.
- API30+ WindowInsetsController.hide(Type.ime) and older InputMethodManager fallback are appropriately SDK-gated. Module requires rebuild; optional loader safely supports older clients/non-Android.

## Findings sent to owner/root

1. P2: unconditional RN Keyboard.dismiss runs before the native map-focus guard; delayed WebView messages can blur a newly focused search/form even when native refuses to hide. Parent blankMap/pan/select callbacks can repeat this JS dismissal. Guard the whole callback pipeline.
2. P2: activity.currentFocus may retain map while a dialog has another focused window. Require actual map/window focus before hiding. Android documents that inset hides may defer until a window gains control, so background-window calls must be avoided.
3. P2: clustered pin click only generates camera/zoom replies, deliberately excluded from IME dismissal. Passive destination-marker clicks also need an explicit user-interaction path. Keep programmatic GPS/camera messages excluded.
4. Follow-up race: a native check can succeed before JS continuation while a form opens. Post-resolution current-interaction validation must include modal-open or all-input focus generation, not only search focus.

## Corrections and final source review

- Android helper now calls the guarded native method first and returns its boolean. It does not dispatch unguarded RN blur before native focus validation.
- Kotlin runs on the UI queue and requires the current focused WebView, bundled-map title, live map window focus and Activity decor window focus before requesting IME hide. It never clears/refocuses controls or captures gestures.
- Bridge interactions are stamped, validated against later search focus and visible Sheets before native dispatch, then rechecked against current committed callbacks after native completion. Closed/unmounted maps drop late completions. Sheet blocking includes details/proposals/settings/legend/location help and the shared arrival visibility.
- Cluster/destination taps now emit direct interaction messages; programmatic GPS/camera/projection replies remain excluded.
- Independently ran keyboard/Leaflet/appearance/Google interaction tests: 15 passing, including real component async-acceptance/refocus rejection and actual Leaflet cluster/destination behavior. Native guard checks are static source tests; autolinking was independently resolved.

No remaining source blocker found. Approval is for local compile/device verification; it does not claim Samsung IME correctness. Parent will locally rebuild and repeat keyboard/pan/selection/drawing and form-refocus checks. Kotlin compilation and actual OEM behavior remain required evidence.
