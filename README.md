# Parkino

Android/iOS parking application built with Expo 57 and React Native, with a browser preview and a shared API backed by SQLite locally or Supabase PostgreSQL when configured. All code lives in this folder; the website project was not edited.

## Run locally

Use Node.js 24 LTS (the API uses built-in SQLite).

```powershell
npm install
npm run api
```

In another terminal in the same folder:

```powershell
npm run web
```

Open http://localhost:8081. The API runs at http://localhost:3001. First launch walks through language, appearance, account creation/sign-in or guest access, then Terms of Service. Initial access requires a connection; returning users can browse the saved catalog offline. Contributions require a connection.

For a physical Android or iPhone, run `npm start` and open the project with the matching Expo Go version. Set `EXPO_PUBLIC_API_URL` to your computer's LAN address, such as `http://192.168.1.10:3001`, in `.env`. Start the API with `$env:HOST='0.0.0.0'; npm run api` on a trusted local network. Allow the API port through the firewall if needed. Restart Expo after changing `.env`. The phone and computer must be on the same network. The default localhost API is not a public deployment.

## Implemented

- Skopje map with 866 geocoded OSM parking features: surface lots, garages, underground facilities and street parking, plus 13 official POC sector polygons.
- 36 published Gradski sign codes, with 34 approximate street/landmark labels on the map; exact boundaries remain unverified.
- One destination search field, offline street/landmark lookup, submitted online address search, map-picked destinations, automatic foreground location and a draggable action drawer.
- Nearest parking within 1.5 km, with published first-hour prices and separate dated driver reports.
- Spaces/full reports, conflicting-report display, expiry after 15 minutes, and refresh every 30 seconds.
- Immediate community parking and polygon contributions, zone labels, free/paid price reports, and public sign photos. Demo proposals also publish immediately, without session-age or vote requirements.
- Shared SQLite/PostgreSQL persistence, username/password onboarding, recorded Terms consent, native SecureStore credentials, request validation, rate limits, contributor-data deletion, and operator-scoped occupancy ingestion.
- Offline catalog cache, per-location and per-tariff source links, explicit coverage/access labels, Google Maps navigation handoff.
- 10-second arrival detection using fresh stationary GPS fixes, with availability first and an optional missing-price question. Opt-in background reminders use native location updates and local notifications; notification taps restore the same prompt.
- Persistent price reporting for facilities and zones, including free parking.

## Important data limits

This is a working first version, not a complete municipal parking register. OSM returned 867 features; one relation did not have importable coordinates, leaving 866 mapped features. OSM features can overlap and may represent private lots or grouped parking areas rather than distinct facilities. OSM coordinates may be feature centres rather than verified vehicle entrances. Exact Gradski sign locations and boundaries have not been established from the public text inventory. A42 was an example in the brief; no official record supporting it was found, so it was not invented.

Only three individual facilities currently have an independently matched official price: Beko, 26 July and Dom na Gradezhnici. POC sector prices and Gradski inventory prices are also shown, but sector centres are excluded from parking recommendations because they are not verified parking entrances. Unknown prices do not mean free parking. The latest driver price is labeled as reported; published tariffs remain available under Details. Clear MKD sign prices fill missing prices and are labeled as AI readings.

Prices are baseline estimates, not payment quotes: billing schedules, seasonal hours, holidays, pollution surcharges, permit exemptions and site-specific exceptions still need authoritative modeling. Walking distances are straight-line estimates. Availability reports are observations, not reservations. Government live feeds are supported but none is connected.

Usernames are unique across the shared database. New accounts use a password; existing device accounts can save a password under Account to preserve their username, points and contribution history after reinstalling. Passwords use salted scrypt hashes; login sessions are random, hashed on the server, expiring bearer tokens. Email password reset is not implemented. There is no proof of distinct people. The first demo trusts human contributions immediately. Set `DEMO_TRUST_INPUTS=false` to restore the legacy proposal confirmation policy; a production review policy for direct contributions still needs to be designed.

## Data refresh and operator integration

```powershell
python scripts/import-data.py --refresh
```

Without `--refresh`, the script rebuilds from `data/raw`. A refresh fetches public OSM/POC source snapshots, not a complete city inventory. Source data is in `data/catalog.json`, and operational data is in `data/runtime/parking.sqlite`. OSM data is ODbL; attribution is shown in the app. Confirm reuse permission for POC geometry and operator data before commercial publication. Leaflet CSS retains its upstream BSD license and uses custom marker graphics.

`npm run import:operator -- path/to/operator.json` validates a partner register and saves it under `data/partners`. Restart the API to load it. Imported operator records must use stable IDs; reconcile them with existing OSM records before delivery to avoid duplicate facilities. See [GOVERNMENT-INTEGRATION.md](docs/GOVERNMENT-INTEGRATION.md) for the exact format and occupancy endpoint.

See [RESEARCH.md](docs/RESEARCH.md) for competitors, sources and coverage findings, and [VALIDATION.md](docs/VALIDATION.md) for checks and limitations.

## Build Android and iOS

`eas.json` includes preview APK and production profiles. Configure your Expo/EAS project and developer accounts, set a deployed HTTPS API URL, and configure `GOOGLE_MAPS_ANDROID_KEY` as an EAS environment variable. Restrict the key to `mk.parkskopje.app` and its signing certificate. iOS uses Apple Maps by default. Android uses a bundled Leaflet/OpenStreetMap fallback when no Google Maps key is configured; it reuses the existing parking clustering and availability logic. Read the current [Expo map setup](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) before building.

```powershell
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile production
```

The phone-preview workflow produces a test-signed release APK; it is not an app-store release. The separate APK-only download server serves exactly one file and does not expose the API. See [ANDROID-PREVIEW.md](docs/ANDROID-PREVIEW.md). Development-client builds also require `expo-dev-client` through `npx expo install expo-dev-client`. A public launch needs the full operator register, verified tariffs/access, stronger identity/moderation, licensed production tiles, deployed API backups and actual device testing. The standard OSM tile server is used only for this small local preview; no tile prefetch or offline tile download is implemented.

## Checks

```powershell
npm run test
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform all
```

## Map-first update (2026-10-01)

The main screen is a full map, destination field and recenter control. The bottom drawer contains destination/add actions, drawn zones and nearby suggestions; the top-right menu contains settings. Parking is ranked within 1.5 km of the destination, or the current foreground location when no destination is chosen. Selecting a destination does not filter parking by its name. Clearing it returns to nearby mode.

The catalog contains 866 parking features, 13 POC sector polygons, 36 Gradski codes and 35 Gradski map labels (30 using operator map coordinates). Gradski's published list confirms D42 (MIDA), not A42. A02 remains in the inventory without a map anchor; A01 now uses the operator's published map point. Approximate labels are never used as parking entrances or arrival geofences. The offline street index uses an OSM snapshot. Online address lookup happens only on explicit submission, through the API's cached, throttled Nominatim search; configure server-only GEOCODER_URL to switch providers. No autocomplete requests are sent to Nominatim.

A GPS watch asks about availability after at least 10 seconds of fresh, accurate, stationary fixes inside a facility polygon (excluding holes), or within 25 m of a point-only facility. It resets for inaccurate fixes, large gaps, movement and departure. Cooldowns persist across restarts: six hours per location and 30 minutes between prompts. Background reminders are opt-in in Settings and need the rebuilt native app, Always/background location and notifications. The OS may delay location delivery; force-stop and some vendor task killers prevent reminders. Real GPS/background delivery still needs field testing.

Driver price reports accept first/subsequent-hour MKD amounts, including zero. They persist separately from official tariffs, are dated, and stay visible for 90 days. Reports for a zone are shared across its sectors with the same operator and code. Presence confirmations are separate from spaces/full reports. In the trusted demo, the latest No hides the location from the catalog without deleting it; a later Yes restores it. Contributor deletion removes both report types. Sharing requires the connected API; the offline-preview APK cannot submit reports.

Sources: https://www.gradskiparking.com.mk/zonsko-parking-zoni.nspx and https://www.gradskiparking.com.mk/javni-parkiralishta-i-zonsko.nspx. Street reference points come from OpenStreetMap, not surveyed sign positions.

## Community zones and sign reading

The API stores contributions, polygons, reports, photos and extraction jobs in `data/runtime/parking.sqlite` (WAL enabled). Back up the SQLite database with SQLite backup tooling; a plain copy while the server writes may omit WAL data. Public photos are served by the same API. Coordinates and polygon crossings are validated, and retries of the same submission/photo do not duplicate records.

Copy `.env.example` to `.env` only if you do not already have one, then set server-only `GEMINI_API_KEY`. Restart `npm run api`. Keys must never use the `EXPO_PUBLIC_` prefix. Without keys, photos remain visible with a pending reading; no fabricated extraction is returned.

Default order: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`. Override with `GEMINI_MODELS` (comma separated). Google Interactions is called directly; no heavyweight AI client is bundled into the app. Requests use stateless mode, schema-constrained output and server-side validation. Images are resized to at most 1600 px and encoded as JPEG before upload. Model access and free-tier quotas depend on the Google account.

Uploads return immediately. A durable SQLite queue runs one extraction at a time, with a 5.5-second per-model timeout, a 30-second chain budget, model cooldowns and exponential retry delay (five attempts maximum). Invalid credentials skip the remaining models for that provider temporarily. Successful duplicate photos reuse their extraction. Stale job leases recover after restart. Readers never block catalog/report requests. Timeouts are configurable with `SIGN_AI_TIMEOUT_MS`; actual speed depends on provider latency.

AI readings remain drafts, including high-confidence readings. The uploader sees the original photo and a digital sign preview, can correct any field, and explicitly confirms it before it supplies missing zone labels, charging hours and prices. Manual correction is available when AI is unavailable. Confirmed tariff-zone signs are inherited by contained parking areas when there is a single matching zone; conflicting overlaps are not guessed. Scalar prices are used only for explicitly read MKD hourly rates. Ambiguous/conditional tariffs remain text. Official source tariffs and human reports are retained; human label edits take precedence. Unclear or non-parking photos remain available for manual review. Session deletion removes that session's photos, label edits and reports, while published locations remain on the map.

Relevant endpoints: `POST /v1/contributions`, `POST /v1/places/:id/labels`, `POST /v1/places/:id/prices`, `GET/POST /v1/places/:id/signs`, and `GET /v1/signs/:id/image`. Writes require an authenticated guest or named account with current Terms consent. `POST /v1/auth/guest`, `POST /v1/auth/login`, `GET/POST /v1/profile` and `GET /v1/usernames/availability` support onboarding. Connected releases use the hosted HTTPS API.

Provider documentation checked 2026-10-01: [Gemini models](https://ai.google.dev/gemini-api/docs/models), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [image input](https://ai.google.dev/gemini-api/docs/image-understanding).

### Zone editing and demo policy

Tap the map to add zone corners and drag a corner to correct it. Finish zone opens the name, label, price and photo form. To adjust a published zone, open its details → Edit price or zone → Edit boundary on map → Save zone. Edits use `PUT /v1/places/:id/boundary` and persist in SQLite independently of the source catalog. Everyone connected to the same API sees them on the next refresh (at most 30 seconds while online); the saving client refreshes immediately. Public availability still requires hosting this API at a shared address, not each user's localhost.

`DEMO_TRUST_INPUTS=true` is the server default for this first demo. It removes proposal vote/age requirements and applies the latest human availability/presence report. Contributions, free prices, labels and boundaries publish immediately. This is intentionally not a production moderation policy. `false` restores the older proposal and availability consensus rules; direct-contribution review is future work.

The map requests fresh high-accuracy GPS. Desktop browsers may provide only a coarse network location; its accuracy circle makes that visible. The location button requests a fresh fix. The default Skopje center is never displayed as the user's location. A destination has a distinct red pin and name label; parking markers cluster until closer zoom.

## Supabase and mobile onboarding

Follow [SUPABASE.md](docs/SUPABASE.md) to connect a project, run `npm run db:migrate`, optionally migrate the existing SQLite demo data, and configure the hosted API. The Parkino Supabase project is connected, with verified TLS, shared application tables and preserved demo accounts. See docs/CLOUD-DEPLOYMENT.md for the Render rollout and connected APK setup.

Native GPS checks foreground permission and system location services, prompts Android to enable its location provider when needed, requests an initial fix for stationary devices, and restarts after returning from Settings. Denied permissions, disabled GPS, timeouts and browser-provider failures have distinct recovery messages. Browser previews require HTTPS (or localhost) and a functioning browser/OS location provider; retries cannot supply a provider the host does not have. Native GPS and camera behavior still require physical-device testing.

All native scroll indicators and web scrollbars are hidden while touch scrolling remains available. Parking forms use compact layouts and fixed Save buttons. Sign photo selection uses a custom in-app Camera/Gallery popup on every platform; the selected native camera or photo browser then opens. The current app requires onboarding even in a catalog-preview build; an offline-only APK is no longer a substitute for the connected multi-user demo.


## Contributions, accounts and rewards update

Every new parking and Details & update starts with manual entry or a sign photograph. Manual entry offers simple (zone, then price/free) and detailed (zone, price/free, total/free spaces, perimeter) paths. Optional steps can be skipped. Each completed step saves independently in the background; account-scoped drafts retain unfinished work and explicit retries. Sign capture needs no prior zone or price entry, and its local camera/gallery popup remains available offline. Upload and AI reading require a connection. Every reading has a digital preview and manual corrections before confirmation.

A facility with a boundary remains a facility; a tariff zone is explicitly selected. Draft fields survive drawing on the map. Settings opens one category at a time. Guest accounts can be upgraded to a password account while keeping their points and contributions. Guest identities alone are not recoverable after reinstalling.

Community free-space counts expire after 15 minutes; total capacity is durable. Full parking details offer the nearest accessible parking with a fresh spaces report. These are observations, not live sensors or reservations. Unknown counts never imply zero spaces.

Points are server-authoritative and recorded once per account and parking detail: parking 10, boundary 20, price 10, capacity 10, confirmed sign 25. Availability earns 3 points per parking per UTC day. Retried submissions cannot duplicate points. Account shows the total and recent events; points have no monetary value.

Rewards unlock without spending points: Ocean palette at 40, Plum at 120, Gold contribution accents at 100, and Violet at 250. The server validates unlocks and only applies a contribution accent to parking created by that account. Availability colors remain separate. Selections survive guest upgrades and password sign-in.

Apply every checked-in migration before deploying the updated API. The new tables remain in the private `parkskopje` schema. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx expo-doctor`. Implementation plans and review notes are in `docs/plans/`.

A separate USB test build can be installed alongside the existing app:

```powershell
node --env-file-if-exists=.env --import tsx scripts/device-test-api.ts
# Another terminal:
.\scripts\build-apk.ps1 -DeviceTest -ApiUrl http://127.0.0.1:3002
adb reverse tcp:3002 tcp:3002
adb install -r preview/Parkino-device-test.apk
```

The isolated test server uses SQLite under `data/runtime/device-test.sqlite`, never the shared database. That explicit `-DeviceTest` build needs USB forwarding. For the normal **Parking Test** app (`mk.parkskopje.app.dev`) use `scripts/build-apk.ps1 -TestPackage -ApiUrl https://parkino-api.onrender.com`, producing `preview/Parkino-test-connected.apk`. It works over Wi-Fi/mobile data without USB. Preserve its signing identity when updating an existing installation.

Local builds use a single-use Gradle process and compile Kotlin in that process. The script also requests Gradle shutdown on success or failure, so builders do not stay resident after compilation. Generated projects and caches remain on disk for inspection.
