# Operator and government integration

Start with Gradski and POC, then ADSDP and commercial operators. Agree on reuse permissions, the list of facilities, stable identifiers, entrance geometry, sign codes, effective tariff rules and ownership. Occupancy should be aggregate counts; this application does not need plates or identifiable camera images.

## Static register

The import command accepts a JSON document with `schemaVersion`, `operator` and `places`. The operator is one of `gradski`, `poc`, `adsdp`, `private`. Each facility has a stable `externalId`, name, coordinate, kind, sign code, access, tariff, capacity, hours and source. IDs become `operator:<operator>:<externalId>`. The schema is enforced in `scripts/import-operator.ts`; missing nullable fields must explicitly be null. Coordinates must be inside this version's Skopje bounds. This first import contract accepts facility entrance points; polygon support can be added when the official geometry format is agreed.

```json
{
  "schemaVersion": 1,
  "operator": "gradski",
  "places": [{
    "externalId": "facility-id-from-operator",
    "name": "Official facility name",
    "coordinate": { "latitude": 41.996, "longitude": 21.432 },
    "kind": "garage",
    "zoneCode": null,
    "access": "public",
    "tariff": null,
    "capacity": null,
    "openingHours": null,
    "source": {
      "label": "Operator supplied register",
      "url": "https://www.gradskiparking.com.mk/",
      "retrievedAt": "2026-09-30T12:00:00Z"
    }
  }]
}
```

This is a format example, not a real facility; do not import it into the live catalog. An established official tariff object includes nonnegative `firstHour`, `nextHour`, nullable `maxStayMinutes`, and its own `source` object. Schedule-sensitive quotes need a richer tariff version before implementation.

```powershell
npm run import:operator -- path/to/official-register.json
```

The importer validates the whole document before writing a partner catalog. Restart the API to load it. Reconcile partner records with OSM facilities first; the importer deliberately does not automatically replace nearby facilities or assume that similar names denote the same entrance.

## Live occupancy

Set server-only `OPERATOR_FEED_KEYS` to a JSON mapping from operator ID to a strong secret. Never embed those secrets in the mobile app. Unconfigured feed endpoints reject requests. Deploy behind HTTPS.

`POST /v1/operators/gradski/observations`, header `X-Operator-Key`, body:

```json
{
  "observations": [{
    "placeId": "osm:way:902213604",
    "freeSpaces": 17,
    "observedAt": "2026-09-30T12:00:00Z"
  }]
}
```

The timestamp is illustrative; send the actual observation time. Existing Beko and 26 July records use operator `gradski`. Partner imports use the IDs defined above. Requests validate operator ownership, nonnegative integer counts, total capacity, timestamps and batch size. Older observations cannot overwrite newer ones. An invalid item rejects the entire batch. Official counts supersede community reports for five minutes, then expire; fresh community reports can remain visible. There is no fabricated zero when data is absent.

The app reads `GET /v1/catalog` every 30 seconds while active. A production adapter can poll the operator's documented API or receive their webhook, convert IDs/timestamps and send this contract. No public government API was verified, so no speculative external endpoint or credentials have been included.

## Pilot acceptance

Agree on one garage, its actual entrance and capacity, permitted reuse, observation frequency, clock synchronisation, outage semantics and operator correction contact. Compare the feed with entrance counters on-site. Request the complete sign-level register and tariff history separately. Build a moderator workflow and stronger contributor identity before public crowdsourcing. The existing admin rejection endpoint is `DELETE /v1/admin/proposals/:id`, using server-only `ADMIN_API_KEY` as a bearer token.
