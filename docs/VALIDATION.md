# Validation — 30 September 2026

## Crash and cloud audit — 1 October 2026

Found and fixed an import-time native startup exception in `src/services/api.ts`: React Native defines `window` without `window.location`, but the API module accessed `window.location.hostname` before selecting the configured HTTPS URL. The regression loads the actual transpiled module with Android/iOS globals and checks both configured and development URLs. Phone logcat is still needed to confirm whether this is the only crash on the reported device.

Added a PostgreSQL pool error listener so an idle connection outage does not terminate the API process. A regression verifies the event is handled without logging private connection details. This server change requires a new Render deployment; the currently deployed API was tested separately below.

Repeated the live public HTTPS smoke test with two temporary accounts: registration, a physical pin, free pricing, an availability report, a zone label, another user's perimeter edit, photo upload/readback and shared catalog all passed. Cleanup returned the database to 914 records. Verified a unique username index and RLS on all 14 private tables; Supabase's security advisors returned no findings.

Uploaded a synthetic parking sign through the actual Render API. Render's durable worker completed a Gemini 3.8 Flash reading in 4.8 seconds, extracting B2, MKD, 40/hour and the charging hours. These appeared in the shared catalog. All test records/photos/accounts were removed. An earlier attempt stayed pending during the two-minute check; the next attempt passed. This verifies deployed credentials and the complete pipeline, not recognition accuracy on every real sign.

All 51 tests, lint and typecheck passed; Expo Doctor passed 21/21 checks. Dependency audit reports 13 moderate transitive Expo/Router/tooling findings, zero high/critical. Automatic fixes propose incompatible Expo/Router downgrades; these were not applied. Review patched compatible upstream dependencies before public release.

The local Gradle build exposed mixed SUBST/real-path autolinking and Ninja's 260-character filename limit. The build script now uses a clean source snapshot in a short real directory and an Expo config plugin sets CMake's object path limit. No generated native source was edited by hand. The corrected script built `preview/Parkino-connected.apk` successfully (618 Gradle tasks, ARM64/ARMv7, min API 24, target API 36). APK v2 signature and ZIP integrity passed. The Render HTTPS URL is present in the Hermes bundle; scanning every decompressed APK entry found none of the configured database URL/password or Gemini key. File size: 61,527,164 bytes. SHA-256: `65b27138e5cb7fc7348aa31441de34ee5d423b71fee6879f73ce1788f8afc6d0`. The download helper now serves this connected build rather than the old offline APK.

No Android device or emulator is currently connected/installed for runtime testing, and browser control is disconnected. Actual phone startup, physical GPS/permission recovery, camera/gallery UI and two-phone mobile-data interactions remain required before declaring the APK ready for the group. EAS build 8e654116-b593-40cd-9ec0-0d8ceba82fda is canceled; it is not an available verified APK.

- Thirteen domain/API regression tests pass: cost rounding, time limits, unknown-price exclusion, distances, zone normalization, report expiry, conflicting reports, distinct-session confirmations, proposal deduplication, operator ownership/freshness/capacity/order, identity deletion, HTTP validation, imported geometry, map grouping, automatic publication through API refresh after session maturity, and moderation.
- TypeScript strict checking passes.
- Expo ESLint passes.
- Expo Doctor: 21/21 checks pass after installing the required font peer dependency and SDK-compatible animation peers.
- Android and iOS Hermes bundles and the web build exported successfully. An Android release APK also built successfully for ARM64 and ARMv7, with a test signing key. APK signature, ZIP integrity, bundled offline-preview guard and HTTPS download response were verified. No physical Android device was available for installation testing. The APK includes the catalog and map/price preview; live contributions are disabled.
- Browser visual/interaction review covered 1280x720, 390x844 and 375x667 layouts; language switching, nearest/cheapest sorting, sourced garage details, sign-code search, community navigation and missing-location map selection were checked. No browser runtime errors were present in the final preview. Native hardware, GPS permission behaviour, Android Google Maps credentials and store releases were not tested.

A full React Doctor scan initially found real cleanup/performance opportunities that were addressed: stable context values, clustered map pins, explicit listener cleanup and a memoized parking list renderer. Its remaining effect-cleanup error points at the Leaflet layer effect, whose return callback calls `layer.off()` for every generated layer and clears the group. This is a heuristic false positive; it was not suppressed. Remaining warnings concern large presentation components, control-flow complexity, small inline list renderers and array/string lookups. The tool's aggregate score is not used as proof of runtime correctness. The changed-files scan initially covered zero new untracked files, so a full scan was used instead.

`npm audit --omit=dev` reports 13 moderate transitive Expo/Router/build-tool findings and no high or critical findings. The suggested automatic fixes downgrade Expo/Router across major versions. Those incompatible changes were not applied. Review upstream fixes before a public release.

The SQLite API is intended for a local pilot. No official real-time feed is connected, and no reports are seeded as if submitted by real drivers. Full sign-level coverage, complete tariffs, schedule-aware payment quotes, commercial map/data reuse, strong identities and actual device testing remain release work.


## 2026-10-01 map-first update

- `npm run lint`, `npm run typecheck`, and all 20 tests passed.
- `npx expo export --platform all --output-dir preview/map-first-export` succeeded for Android, iOS and web. This verifies JS bundles, not a rebuilt or installed APK.
- Mobile browser preview checked at 390 x 844: search overlay, nearby list, B2 tariff details and price-report form. Destination selection changed results from Macedonia Square to parking near City Mall. No browser console errors were reported.
- Live `/v1/search?q=Skopje%20City%20Mall` returned bounded Skopje coordinates.
- Arrival tests cover a full minute, stale/inaccurate fixes, movement, leaving, cooldown and polygon holes. Report tests cover validation, per-session replacement, expiry, deletion and shared zone-sector prices.
- GPS arrival behavior still requires a physical-device field test. Detection is foreground-only. Sharing requires the API; no public API deployment or APK rebuild was performed in this update.
- Catalog: 866 facilities, 13 POC polygons, 36 Gradski codes, 34 approximate Gradski map references and 1,513 saved destinations. 770 anonymous facilities now have nearby street context; these labels do not establish sign codes or legal access.

## 2026-10-01 drawer, contributions and sign-reading update

- `npm run lint`, `npm run typecheck`, and all 25 tests pass.
- `npx expo export --platform all --output-dir preview/export-verified` succeeds for Android, iOS and web (bundle validation, not installed-device validation).
- At 390 x 844, checked pointer dragging both directions, tap/keyboard handle access, light/dark settings, and search focus without an orange outline.
- Completed a real local-browser flow: drew a polygon; submitted a clearly labeled test sign image and zero-price report; then updated the first/following-hour prices and zone label. The details screen displayed the public image, new prices and label. The independent catalog API and an API restart confirmed persistence. Only this temporary QA record and its dependent data were removed afterward.
- Fixed the empty-JSON session-creation request discovered by that browser test. The photo workflow uses Expo image selection/manipulation, then an authenticated JSON upload.
- Tests exercise anonymous HTTP sessions; geometry crossing/bounds validation; missing auth; invalid/oversized images; submission/photo deduplication; persisted images and job leases; contributor deletion; human/official/AI price precedence; confidence/currency checks; sequential Gemini model failures, malformed results, timeout, cooldown and early success.
- Gemini Interactions formats were checked against current official docs. Default models are Gemini 3.8/3.7/3.6/3.5 Flash, with low reasoning effort. No provider keys are configured here. Real-provider accuracy, latency, access and quota behavior have not been measured; model fallback tests use injected responses. Photos remain publicly visible while extraction is pending.

## Draggable zones and trusted demo — 2026-10-01

- Removed the paid fallback provider from server code, configuration and privacy copy. Exhausting Gemini leaves the durable job queued for retry.
- Demo mode publishes a first contributor's proposal immediately. Latest availability and price reports take effect; a latest No presence report hides a location until a later Yes. Structural validation and session authentication remain active.
- Web, Google native maps and the native Leaflet WebView expose draggable draft vertices. Saved zones can be reopened through Edit price or zone → Edit boundary on map. Boundary overrides persist separately from imported source data.
- At 390×844, browser verification moved a draft corner, published a free zone, reopened it, moved another corner and saved successfully. An anonymous HTTP read after a real API restart returned the exact edited polygon. Only the named QA zone was then removed.
- Removed zoom controls on every renderer, reduced pin size and clustering density, and show zone labels at close zoom or selection. Destination uses a red pin and persistent name label.
- Browser location now calls the browser geolocation API directly with high accuracy, zero cached age and error handling. Stale or invalid fixes are rejected; approximate readings have an accuracy circle. Actual device location is not inferred from Skopje's default map center. Physical-device GPS accuracy remains unverified.
- 29 domain/API tests pass, including browser location options, fix quality, cross-session boundary updates, persistence after reopen, trusted demo behavior and Gemini-only exhaustion. Lint, typecheck and web/iOS/Android exports pass. Native gesture behavior still needs a physical-device check.
- Native camera/photo permissions, physical GPS arrival, installed Android/iOS gestures and a publicly deployed HTTPS API still need device/deployment verification. No existing APK was rebuilt during this update.
- Browser proof: `preview/zone-upload-verified.png`; clean map: `preview/simple-map-mobile.png`.

## Mobile onboarding, location recovery and Supabase preparation — 2026-10-01

- 37 tests pass. Added SQLite and PostgreSQL onboarding tests for explicit Terms consent, normalized/case-insensitive username collisions under concurrent requests, registered-profile write requirements, cross-user prices/labels/boundaries, photo deduplication and byte persistence, exclusive job claims, account deletion, and bulk catalog reads. PostgreSQL SQL/migrations run against an isolated PGlite engine; a separate pool test verifies session initialization and commit/rollback connection affinity.
- Native location adapter tests cover foreground permission requests, blocked permission, disabled services, Android service enablement, an initial stationary fix, cancellation and watcher cleanup. Browser tests cover fresh high-accuracy requests, lower-accuracy fallback, permission errors, insecure origins, late callbacks and cancellation.
- Typecheck and Expo lint pass; Expo Doctor passes 21/21 checks. Android, iOS and web bundles export to `preview/export-mobile-onboarding`. This is bundle validation, not a rebuilt/installed APK or iOS build.
- Browser onboarding fits at 360×640 in English and Macedonian with no visible scrollbar. Username availability resolves from the running API; Continue remains disabled without consent. Opening and returning from Terms preserves the draft. No account or consent was created on the user's behalf. Screenshot: `preview/mobile-onboarding-verified.png`.
- Native iOS/Android photo choice uses platform action sheets/dialogs. Parking forms are more compact and have fixed Save actions; detail editing hides the surrounding information until editing is finished. These native controls/keyboard layouts need physical-device verification.
- An isolated page using the app's browser geolocation service, outside the map/account flow, repeatedly returned `timeout: Timeout expired` in the desktop preview. The browser host still did not supply a position. This does not verify or disprove native phone GPS; real-device location, camera/gallery and arrival behavior remain unverified. The temporary diagnostic page was removed.
- Supabase adapter, SQL migration runner, optional local-data import, and setup instructions are ready. No Supabase project, hosted API or credentials are configured. Local development continues on shared SQLite. The real hosted TLS/pooler connection has not been tested.

## Map interaction and onboarding revision — 2026-10-01

- 39 tests pass. Arrival now needs 35 seconds of fresh stationary fixes with accuracy within 25 m. Tests cover the threshold, movement, gaps, inaccurate fixes, cooldown, polygon holes, real zone boundaries, approximate labels and facility preference over encompassing zones.
- Nearby recommendations require a fresh fix within 50 m accuracy, unless the user selected a destination. Add parking requires a fresh stationary fix within 25 m and uses its coordinates. Missing GPS never substitutes the default map center. Tests cover null, stale, coarse and moving fixes.
- Fresh available-space reports remain separate from marker clusters; expired reports return to ordinary clustering.
- Expo lint, TypeScript and web/Android/iOS bundle exports pass. These are bundle checks, not installed device tests.
- Browser verification at 390×844: Continue opens Terms; acceptance is disabled until the end is visible; closing preserves the username. No test account/Terms acceptance was submitted.
- Verified center-pin destination mode hides the surrounding controls and restores them on confirmation. Parking selection shows a small card and leaves the map pane transform unchanged. Update info opens a compact editor. The drawer collapses to a lip, leaves attribution visible and contains no visible scrollbar. Settings clearly mark the active English language and theme.
- The local preview browser still returns location timeouts. Refresh GPS restarts acquisition, shows the red notification below search and never invents nearby results. Actual Android/iOS GPS, permissions, map gestures and camera/gallery require physical-device verification.
- Thirty zone anchors were refreshed from the operator map and verified through the running API after restart. See ZONE-SOURCES.md for source limitations.
- Supabase plugin was offered but remains uninstalled/unconnected. No project, cloud database connection, hosted API or native install was created. The app still uses the local shared SQLite server.
- Browser evidence: `preview/review/parking-card.jpg` and `preview/review/terms-scrolled.jpg`.

## Cream/red interface and physical parking perimeters — 2026-10-01

- Warm cream/beige and rich red replace the green interface, with a matching warm dark theme. Available-space reports retain their separate green status color.
- Compact close glyphs keep expanded touch targets. Buttons and sheet headers are smaller. All shared sheets and Terms dim the full background and use Expo BlurView; Android uses the SDK 57 BlurTargetView API, with a dim fallback before Android 12.
- The drawer sits flush at the bottom, with a small OpenStreetMap credit overlaid on it instead of a separate strip. Its expanded height follows content. Recenter hides during upward dragging and expansion; the fully collapsed state only shows the lip.
- Every physical parking type now supports editing its perimeter through Update info. Physical footprints use solid red outlines; tariff zones retain dashed blue outlines. Footprints appear on selection or close zoom to limit clutter. All map renderers support the edit path.
- Shared boundary edits preserve the parking type, zone label and physical entrance pin. The demo publishes the latest valid edit. SQLite and PostgreSQL tests verify separate-user reads/edits, source re-import persistence, authentication and invalid boundary rejection for surface/street/garage/underground parking.
- Raised the common drawing limit to 256 corners to support the imported 119-point parking outline. 40 tests, lint and typecheck pass; web/iOS/Android bundles export successfully.
- Browser checks at 390x844 and 320x568 confirmed compact settings, full-app blur, drawer expansion/collapse, recenter visibility and adjustment of a physical parking corner. Test corner adjustments were cancelled without changing the live catalog.
- Evidence: preview/review/cream-map.jpg, cream-settings.jpg and drawer-lip.jpg. Native installed-device blur and gestures remain unverified. The shared local API is running; Supabase is still not connected.

## Cloud rollout preparation — 2026-10-01

45 tests, lint and typecheck pass. Android Metro export passes. A real Supabase transaction exercised two registered accounts, shared availability, free prices and labels; all QA writes were rolled back. Added Render Free blueprint, verified public CA, database readiness, production storage guard, bounded cold-start probing without automatic mutation replay, trusted-proxy rate limits, and connected APK URL validation. Public Render deployment and an actual two-phone APK test remain pending hosting/repository access.

The restarted API returned 914 places in approximately 1.1 seconds from Supabase. Both release profiles reject localhost URLs. The configured Gemini key authenticated successfully, all four fallback models were listed, and a real vision request completed through gemini-3.5-flash, correctly rejecting a non-sign test image. This does not validate OCR accuracy on an actual parking sign.

## Public Render verification — 2026-10-01

Created public repository vasosofuji/Parkino and deployed parkino-api on Render Free in Frankfurt. Render ran typecheck and all 45 tests successfully. https://parkino-api.onrender.com/health returned ready with the live Supabase connection. Two temporary accounts exercised public HTTPS registration, shared availability, zero prices, zone labels, physical parking perimeter edits and image upload/readback. Generated test accounts/records were removed; the catalog returned to 914 places. Local .env points to the public API. EAS browser authentication is pending before the connected APK build. The unchanged portfolio domain is not required for this deployment.

Expo authenticated successfully; linked @parkino/parkskopje and submitted EAS APK build 8e654116-b593-40cd-9ec0-0d8ceba82fda with EXPO_PUBLIC_API_URL=https://parkino-api.onrender.com and offline preview disabled. The cloud APK is waiting in the free queue. Render browser origins were corrected and verified for localhost:8081; the public catalog still contains 914 records. Android/iOS physical GPS and actual APK installation remain unverified.
