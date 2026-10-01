# Contribution update integration

## Plan

Delegate contribution/sign UI, background arrival detection, and accounts/rewards to separate agents with their own plans. Integrate shared domain/API/database contracts, add a versioned database migration, then review cross-feature state and persistence. Test SQLite and PostgreSQL paths, build the native app, and verify the connected Android phone using isolated data.

## Completed integration and review

- Added capacity and expiring free-space counts to contributions, reports and catalog reads; distinguish a physical parking boundary from a tariff zone. Nearby alternatives use fresh available-space reports.
- Added private account, token, reward, capacity, sign-confirmation and contribution-snapshot tables. The migration was created through Supabase CLI, then exercised with PGlite; it has not been applied to the hosted database.
- User confirmation is separate from raw AI extraction. Only uploaders can confirm a photo. A unique compatible containing tariff zone supplies a confirmed digital sign; conflicting zones do not silently propagate prices. Independent manual prices take precedence.
- Reviewed retry and concurrency behavior: immutable contribution snapshots prevent claiming another person's later work, reward keys prevent next-day replay awards, and session generations prevent stale requests overwriting a new login.
- Independent agent reviews found and fixed zero-capacity recommendations, old cached draft hours, contradictory sign-zone propagation, notification/modal priority, and iOS modal handoff. See the review files alongside this plan.
- A physical Android check found a foreground-service startup race when Home followed permission approval immediately. Startup now defers until the app is active and respects logout/opt-out cancellation.
- An additional Antigravity read-only review was attempted. It timed out after 15 minutes without producing a completed review; it is not counted as validation.

## Delivery boundaries

The separate Parking Test APK and USB API use isolated SQLite data. The original connected app, hosted API and Supabase records were not updated by this implementation. Field notification delivery and real Macedonian sign OCR accuracy remain explicit user/device checks. See `docs/VALIDATION.md` for actual commands and phone results.
