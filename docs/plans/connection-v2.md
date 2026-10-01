# Hosted connection and release validation

## Plan

Diagnose the reported save/camera failure, remove dependency on USB forwarding for the user's test build, and integrate the separately delegated UI, guest, security, GPS and rewards work. Review each workstream with another native agent; do not use Antigravity. Verify tests, Expo lint/typecheck, web/mobile exports and a connected release build before updating the existing hosted API.

## Findings and changes

- The user confirmed the errors occur in Parking Test. That APK used `http://127.0.0.1:3002` through USB forwarding; ADB currently sees no phone, so the on-phone address cannot reach the PC server. The hosted API is healthy.
- Camera/photo source controls were also gated on catalog connectivity, incorrectly disabling local image capture while offline. A separate camera task removes that dependency.
- Added a production HTTPS default and configuration validation. USB-local traffic requires an explicit test flag; a separate test-package flag supports the existing Parking Test identity with a public HTTPS API.
- Transport does not replay interrupted writes or attach browser cookies, and requests redirect rejection where supported. React Native's native networking behavior is separate, so this is not claimed as a verified native redirect guarantee. A rate-limited readiness response stops probing and respects a bounded cooldown.
- Existing hosted database contains only the original migration; account/sign and guest changes must be applied before deploying the matching backend. Supabase security advisors returned no findings before changes.

## Validation so far

Ten endpoint/startup/transport tests pass. Final integrated checks and release outcomes will be recorded in `docs/VALIDATION.md`.

## Dependency review

The first npm audit identified 13 moderate transitive reports rooted in two advisories: URL-decoder denial of service (GHSA-vcc3-ghjq-m6fr) and UUID buffer bounds (GHSA-w5hq-g745-h8pq). Automatic remediation suggested downgrading Expo, which is incompatible with this project. The scoped xcode UUID dependency now uses 11.1.1, retaining its CommonJS v4 API. Expo Router's CommonJS query-string 7 uses a local MIT-licensed compatibility copy of upstream decode-uri-component 0.5.0; only the ESM export declaration changes. See the vendor README/license. Tests verify Cyrillic query round trips, adversarial decoding in a timeout-bounded subprocess, and native project identifier generation. The resulting audit reports zero known vulnerabilities; this does not establish the absence of all security defects.
