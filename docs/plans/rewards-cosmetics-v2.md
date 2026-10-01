# Earned appearance rewards

## Plan

- Unlock, never spend: Ocean palette at 40 points, Plum at 120; gold contribution accent at 100, violet at 250. Default is always available.
- Store choices on the stable account identity, preserving them when guests create a username and password or sign in again.
- Validate the selected style and earned total on the server. Expose only eligible accents for parking originally created by that contributor; later edits do not transfer ownership.
- Add a short Rewards screen with previews, remaining points, and selected state. Apply palettes to app surfaces and controls, keeping success/full/error colors stable.
- Add a small ring/border to contributor-created map pins across web, native Leaflet, and Google Maps. Availability fill, labels, selection, and clusters remain legible.
- Create the schema migration through Supabase CLI. Verify SQLite and PGlite authorization, exact thresholds, reset, guest upgrade, and original-contributor mapping; then run lint and typecheck.

## Implementation and validation

- Added server-validated partial cosmetics updates and a private `account_cosmetics` table, generated through the Supabase CLI. Both profile types load eligible choices from the stable session identity. A single bulk catalog query joins original creation ownership with earned totals, preventing later editors from recoloring somebody else's parking.
- Added bilingual Rewards tiles, previews, progress, free reset, and an account link. Theme palettes follow the signed-in profile; status/error colors remain unchanged. Guest upgrades and subsequent sign-ins retain choices.
- Added a small contribution border in Google Maps and both Leaflet renderers. Clusters retain their existing appearance. Google selected markers prioritize selection; Leaflet uses a separate selection outline. Removed the web selected-marker background override so selecting a marker preserves its availability color.
- Isolated frequent GPS dot/accuracy updates from native and web Leaflet parking layers, moving existing location shapes instead of recreating parking markers for every fix.
- Added SQLite/PGlite tests covering unauthenticated and unconsented updates, malformed styles and attempted identity/points spoofing, exact unlock thresholds, no point spending, partial updates, ownership, guest upgrade/login retention, zero-point reset, stale ineligible choices, account deletion and RLS grants. Palette contrast tests verify normal text, muted text and white button labels, and prevent semantic color overrides.
- Also tested explicit current-Terms consent during login; older clients without consent retain the write gate until they renew.
- Validation: the full suite passed **134/134**; lint and typecheck passed. The first full run identified and fixed standalone CommunityStore schema initialization and the catalog bulk-query budget (one added bulk query, not a query per parking).
- Independent review found small dark-theme accent text reused a button-fill color and fell below readable contrast. Added separate `accentText` tokens for colored text/icons across account, coverage, community and contribution screens, preserving button fills. The focused suite passes with foreground contrast checked against paper, mint and input surfaces in both modes, in addition to white button-label contrast.

## Self-critique and operational boundaries

- Unlocks reflect contribution points, not proof that every crowd report is accurate. Existing contribution limits/deduplication remain the abuse controls; no purchase or spending system is introduced.
- Guest choices remain device-bound until the user creates a recoverable account. Signing into a different existing account does not transfer guest points.
- Cached cosmetics can remain visible offline; the server validates every new selection and public catalog accent against earned points. Unknown or no-longer-eligible styles fall back to classic.
- Selected native Google markers intentionally prioritize their selection border. Cosmetics never change the reported spaces/full fill. Dense clusters have no individual contributor accent.
- Native visual checks and hosted deployment belong to the parent. This subagent made no hosted schema mutation; the parent separately applied the reviewed migration.
