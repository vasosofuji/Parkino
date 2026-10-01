# Private APK cloud rollout

The live deployment at https://parkino-api.onrender.com uses one free Render Node web service and the existing Parkino Supabase database. `render.yaml` fixes Node 24.16.0, installs the lockfile, runs typecheck/tests before deploying, binds the platform-provided port, and checks database readiness at `/health`. Deploys are manual until the first rollout is verified. The portfolio domain is not required; use Render's HTTPS service address initially.

## Access and deployment

1. Sign in to Render and connect the public https://github.com/vasosofuji/Parkino repository. The origin remote is configured. Keep `.env`, `data/runtime`, APKs and keys out of the repository. The public Supabase CA in `certs/` is intentionally included; it is not a private credential.
2. Create the Blueprint from `render.yaml`. Confirm the service uses the **free** compute plan. Keep Supabase as the database; do not create a temporary Render database.
3. Set `DATABASE_URL` privately from the current server's `.env`. The dedicated `parkino_api` login is sufficient. `DATABASE_CA_FILE=certs/supabase-ca.crt` enables certificate verification. Schema migrations require a separate administrator connection; they are not run during startup.
4. Optionally set `GEMINI_API_KEY` in Render's secret environment settings, with `GEMINI_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash`. Without a key, photos remain saved/viewable and extraction waits. Never put this key into EAS public variables.
5. Verify `/health` returns `{"status":"ok","schemaVersion":1}`, `/v1/catalog` includes imported records, and registration/report/photo/boundary changes are shared across two independent device accounts. Check the service logs for startup or database errors. Verify the actual edge proxy is recognized by the configured private/loopback trusted ranges before inviting users; never trust arbitrary forwarded headers.
6. Set the EAS **preview** environment's `EXPO_PUBLIC_API_URL` to the actual HTTPS API address. Run `npx eas-cli@latest build --platform android --profile preview`. Release profiles reject missing/local HTTP URLs. Alternatively, the existing local Windows script supports `-ApiUrl https://YOUR-SERVICE.onrender.com`; offline preview requires the explicit `-OfflinePreview` switch.

## Behavior and limits

The client shares a read-only health probe across concurrent requests, allowing up to 75 seconds for a cold host to wake before sending mutations. It never automatically replays an interrupted write: the user must check refreshed data before retrying. Normal API calls have a 15-second timeout. Reads refresh every 30 seconds while the app is active and on return to foreground.

All durable contributions, images and job leases are stored in Supabase. The production API refuses to start without `DATABASE_URL`, instead of silently losing data in an ephemeral SQLite file. Render Free can sleep after inactivity, delaying background sign jobs. Free-tier startup, photo extraction with a real key, and actual two-phone mobile-data behavior must be verified on the deployed service before calling the APK ready.

The updated API supports username/password sign-in and explicit guest consent. Guest upgrades preserve identity and points. Existing device accounts must add a password under Account before clearing or reinstalling. Email password reset is not yet available. Apply all contribution/account, guest/security, and reward-cosmetic migrations before deploying the updated API. Preserve the Android signing identity when distributing later APK updates. Use `-TestPackage` with the public HTTPS API for Parking Test; reserve `-DeviceTest` for isolated USB-only testing. Moving the backend to a home laptop can keep the same database and public API hostname later.

References: [Render free limits](https://render.com/docs/free), [Blueprint configuration](https://render.com/docs/blueprint-spec), [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).
