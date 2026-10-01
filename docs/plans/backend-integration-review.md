# Backend integration review

Read-only review of `server/sign-catalog.ts`, SQLite/Postgres community stores, API contribution/sign/capacity/reward routes, and contribution-flow tests. Findings were verified with isolated in-memory API or pure-domain probes; no production data or source files were changed by the reviewer.

## Reproduced findings

1. **P2 — Contribution retries claimed other users' rewards.** The original contribution route derived reward eligibility from the parking's current aggregated price/availability. Reproduction: A adds a quick parking (10 points), B reports its price and two free spaces, A retries the unchanged original `requestId`; A's score becomes 23 without supplying either detail. Applies to both stores via the shared route. Parent notified and subsequently added immutable, author-owned `contribution_details` snapshots; regression coverage should retain this exact cross-user scenario and a next-day retry.

2. **P2 — Zero-capacity parking accepted “spaces” without a count.** Both `report` methods validate capacity only inside `freeSpaces !== undefined`. API probe with capacity 0 and `{status: "spaces"}` returned 200; catalog showed capacity 0/status spaces and `nearestAvailableParking` recommended it. Reject that status at known zero capacity, and invalidate existing contradictory availability when capacity is corrected to zero. Parent notified.

3. **P2 — Legacy unconfirmed AI hours survived cache sanitization.** `confirmedSignCatalog` removed draft `signInfo` and its zone label but left the old `openingHours` copied from that draft. Probe returned no signInfo but retained `openingHours: "unreviewed AI hours"`. Clear hours attributable to the removed draft while preserving independent source hours. Parent notified.

4. **P2 — Conflicting sign/zone codes propagated the wrong zone tariff.** `enrichSigns` retains an existing or community zone label over the confirmed sign's code. Inheritance then matches against that retained label without checking the conflict. Probe: B2 zone + confirmed C2 sign + B2 facility inside boundary produced a B2 facility with inherited C2 sign and 99-MKD sign price. Exclude contradictory zones from inheritance or explicitly reconcile the label; do not silently infer a tariff across the conflict. Parent notified.

## Checks without additional findings

- AI extraction is stored separately from user confirmation. Cached raw extraction reused at another location does not copy confirmation, so it remains unpublished until that location's uploader confirms it.
- Confirmation requires ownership through the original upload or an explicit duplicate upload. Numeric sign fields are bounded by the shared schema, and empty confirmations are rejected by the route.
- PostgreSQL contribution retries lock the session and recheck the request key inside the transaction; duplicate uploads lock the parking row. SQLite inserts are transactional and synchronous.
- Capacity reports and displayed capacity use the same latest timestamp/session tie ordering. Impossible exact counts above a corrected positive capacity are stripped during catalog enrichment.
- Reward inserts use `(session_id,event_key)` conflict deduplication. The confirmed-sign reward is per place, not per photo or repeated correction.
- New contribution drafts do not require zone/pricing in the photo path; the API accepts unknown values. Drawn geometry is validated before persistence.

## Verification

The probes above exercised SQLite API behavior and shared domain functions. Parent subsequently authorized fixes to findings 2–4; those fixes are now implemented:

- Both stores reject `status: "spaces"` at a recorded capacity of zero, including omitted counts. Catalog enrichment makes previously available status unknown after a zero-capacity correction. Offline nearest-space recommendations independently exclude zero-capacity places.
- Cache migration clears opening hours equal to the removed legacy draft's charging hours; distinct independent hours and confirmed sign hours remain.
- Zone inheritance stops when the effective zone label conflicts with its confirmed sign code. The source zone keeps both pieces of evidence for human correction. Normalized Latin/Cyrillic matches still propagate, and a later conflicting community label stops propagation again.
- `tests/parking-integrity.test.ts` adds six meaningful regressions, exercising the API through SQLite and PGlite/Postgres for count and sign rules, plus offline recommendations and cache cleanup.

`npx tsx --test tests/parking-integrity.test.ts tests/contribution-flow.test.ts tests/community-signs.test.ts`: 17 tests passed. `npx expo lint` and `npx tsc --noEmit`: passed. Reward snapshot implementation and its additional regression remain owned by the parent agent.

Parent resolved finding 1 using immutable contribution reward snapshots in both stores. Integration regressions now cover the exact cross-user enrichment/retry scenario and a replay on the following day; both SQLite and PostgreSQL pass.
