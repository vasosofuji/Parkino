# Map clarity and selection, version 3

## Plan

- Use one pure marker-appearance helper across Google Maps, web Leaflet, native Leaflet, previews and rows. Incomplete/unreviewed places get a distinct fill and `?`; pricing-free places get a teal neutral fill and `0` cue. Recent availability retains green/red fills and contributor cosmetics retain a separate border.
- Treat official verification, confirmed sign details, human zone labels, current human pricing, or positive presence confirmation as review evidence. An imported name alone is not review. Presence only confirms the place; it must not invent price/sign details.
- Trace selection/camera/preview behavior before editing: inspect marker focus panning, stale asynchronous projection replies, marker rebuilds and popup measurement. Fix those causes with stable selection and layout rather than decorative animation.
- Blank-map taps blur the search input and dismiss the keyboard, with renderer-level picking/drawing events kept separate.
- Add a concise legend to the map and integrate the navigation/loading helper supplied by the other UI agent.
- Verify marker combinations, stale evidence, free pricing vs free spaces, stable overlay placement and picking. Run lint/typecheck, perform self-review and report device-only limits.

## Documentation and findings

- Read AGENTS.md, Expo SDK 57 reference and docs index, Expo react-native-maps, React Native 0.86 Keyboard, react-native-maps 1.27.2 MapView/Marker and Leaflet map sizing documentation before API edits.
- Initial inspection: choosing a second pin can briefly reuse the first pin's screen position before the asynchronous WebView projection arrives. Preview height starts at a guessed 170 px, then jumps after layout. Leaflet render calls invalidateSize with default panning on every selection; markers allow focus-triggered automatic panning. These are concrete instability paths to address.

## Implementation and validation

- Added `marker-appearance.ts` and applied it to all three renderers, previews and rows. Needs-review locations retain a purple `?`; if recent availability exists, a separate green check/red cross carries that report without implying review. Reviewed free parking uses teal when availability is unknown and retains a `0` fee badge when full/available. Contributor border colors remain separate.
- Review evidence uses official verification, confirmed signs, current human prices, human zone labels, or a positive majority in the server's 90-day presence aggregate. Presence does not manufacture price or sign details. Old OSM names and availability alone do not count as persistent review.
- Added a map legend through the map info control. The preview now opens the selected navigation app through the supplied navigation service; map search uses the shared branded loading indicator.
- Blank-map taps explicitly blur the search field, dismiss the keyboard and close search results. Native polygons use a gate for Android's named overlay events and Apple's unlabelled paired event at the same coordinate, so selecting a polygon is not immediately cleared. Drawing picks are still dispatched once.
- Removed focus-induced Leaflet panning and repeated selection-time size invalidation. Leaflet projection replies include selection identity and anchor coordinates. Google success and rejection paths both reject stale projections. Selecting a different pin clears the old screen anchor before rendering its preview.
- Preview cards measure before becoming visible, scroll when long and keep a bounded placement. Pointer arrows render only when actually aligned with the pin. A review caught a two-pixel maximum-height mismatch; the scroll allowance now includes padding, borders and margin.
- Marker frames keep a stable center/size during selection and contain free/status badges in native marker bitmaps. Independent review identified clipping in the original frame; it is now 60×48 with a separate inner selection halo.
- The map receives ParkingContext's explicit clock, including marker and clustering dependencies, so cached/offline availability and prices expire without requiring a pan. One-second GPS updates still move only the location dot/accuracy overlays.
- Validation: **11 focused tests passed**, including actual native Leaflet script behavior and a transpiled Google component harness for delayed projection rejection and footprint picks. Final lint, typecheck and diff checks passed. A full suite run passed 160/161 with the one unrelated photo test missing a `useRef` mock; the entry owner repaired that harness.

## Self-review and remaining limits

- No claim that presence review verifies prices: the fee badge requires usable price evidence and both first/following hours equal zero. Unknown/expired information falls back to needs-review or a reviewed neutral pin.
- The backend supplies already-filtered presence aggregates without per-vote timestamps. Offline presence review has the same freshness limitation as that saved catalog; no new permanence guarantee is inferred.
- Native camera/keyboard timing and visual behavior still require the parent's connected-phone pass. Apple overlay handling is verified against the installed native source and tested for paired-event suppression, not an iOS physical device.
