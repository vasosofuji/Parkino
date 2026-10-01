# Contribution and map refinement — persistent integration memory

## Scope and ownership

- `entry-v3.md`: direct custom photo-source popup, stable manual entry, required follow-up steps, compact header Back.
- `map-v3.md`: review/free-price marker semantics, selection stability, map keyboard dismissal.
- `loading-navigation-v3.md`: accessible branded loading, persistent Google Maps/Waze preference and launch fallback.
- Parent: integration and independent criticism of each change, complete tests/lint/typecheck, platform bundles, signed test update and connected Samsung checks.

## Decisions

The existing contribution data determines whether a pin has useful reviewed information; no new server flag or migration is necessary. Free pricing is distinct from available spaces. Status fills and separate zero-price badges preserve this distinction, while earned contributor accents remain separate borders.

Only the zone-label step can be skipped in manual entry. Simple entries require a price or explicit Free choice. Detailed individual parking entries also require total/current-free estimates and a perimeter. Tariff zones cannot have individual-area capacity according to the existing API, so their detailed flow requires price and perimeter. Each completed step keeps its current autosave behavior; closing does not erase previously saved work.

Testing uses the already-authorized temporary guest in Parking Test. Do not alter real parking information. The connected API uses hosted HTTPS and does not depend on USB forwarding. Original test signing credentials must be retained for an update that preserves application data.

## Review and validation

Parent criticism and agent cross-review found and repaired the following integration defects:

- Native marker badges extended beyond Android's bitmap bounds; a larger stable frame preserves their complete shape without resizing on selection.
- A failed old coordinate projection could clear a newer successful selection. Both promise outcomes now use request/selection guards.
- Android and Apple Maps duplicate polygon taps could immediately clear the selected area. A narrow overlay gate consumes the paired map event. Area handlers also honor destination picking before that duplicate is consumed.
- Maximum-height previews were two pixels outside the visibility allowance. Scroll content is now bounded below the measured outer-card limit.
- Offline map memoization lacked the context clock, preserving expired colors until another interaction. All marker renderers and grouping now receive the same 30-second clock, independent of live GPS updates.
- Hidden Android Modal content can unmount during drawing. Returned map geometry explicitly overrides the restored draft and is saved on remount.
- Existing-sign review is now a sibling modal with iOS dismissal-completion handoffs in both directions.
- The optional post-sign offer had an inert Back action; the offer omits it, while its detailed wizard can return to the offer.
- Independent review identified that starting navigation-preference hydration alone did not prevent a first-tap race. Startup readiness must include preference hydration; a failed storage read must settle to the default.

An isolated EAS test snapshot is prepared at the ignored path recorded in `preview/cloud-build-root-v3.txt`. It excludes private `.env` values and uses the original test key as local EAS signing credentials. It builds package `mk.parkskopje.app.dev` with the hosted HTTPS API and cleartext disabled. No generated native directories are created or edited in the repository.

Final tests, platform bundles, EAS identifier and Samsung outcomes remain to be recorded after the last cross-review repair.
