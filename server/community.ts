import { createHash, randomUUID } from "node:crypto";
import type {
  Contribution,
  Geometry,
  ParkingPlace,
  PhotoUpload,
  SignInfo,
  SignPhoto,
} from "../src/domain/types";
import { normalizeZoneCode } from "../src/domain/parking";
import type { ParkingStore } from "./store";
type PhotoRow = {
  id: string;
  place_id: string;
  created: number;
  status: SignPhoto["status"];
  info: string | null;
  model: string | null;
};
export class CommunityStore {
  constructor(private store: ParkingStore) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS contributions(request_id TEXT NOT NULL, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, place_id TEXT REFERENCES places(id) ON DELETE CASCADE, UNIQUE(request_id,session_id));
      CREATE TABLE IF NOT EXISTS labels(place_id TEXT REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, code TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE INDEX IF NOT EXISTS labels_by_place ON labels(place_id,created DESC);
      CREATE TABLE IF NOT EXISTS boundaries(place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE, geometry TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sign_photos(id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, hash TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued', info TEXT, model TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, UNIQUE(place_id,hash));
      CREATE INDEX IF NOT EXISTS photos_by_place ON sign_photos(place_id,created DESC);
      CREATE INDEX IF NOT EXISTS photo_jobs ON sign_photos(status,next_attempt);
    `);
  }
  contribute(input: Contribution, token: string) {
    const user = this.store.session(token);
    const previous = this.store.db
      .prepare(
        "SELECT place_id FROM contributions WHERE request_id=? AND session_id=?",
      )
      .get(input.requestId, user.id) as { place_id: string } | undefined;
    if (previous) return this.store.place(previous.place_id);
    const place: ParkingPlace = {
      id: "community:" + randomUUID(),
      name: input.name,
      coordinate: input.coordinate,
      geometry: input.geometry,
      kind: input.kind,
      operator: null,
      zoneCode: input.zoneCode ? normalizeZoneCode(input.zoneCode) : null,
      zoneCodeEvidence: "community",
      access: "unknown",
      tariff: null,
      capacity: null,
      openingHours: null,
      verification: "community",
      source: {
        label: "Community contribution",
        url: "",
        retrievedAt: new Date().toISOString(),
      },
    };
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      this.store.db
        .prepare("INSERT INTO places VALUES (?,?)")
        .run(place.id, JSON.stringify(place));
      this.store.db
        .prepare("INSERT INTO contributions VALUES (?,?,?)")
        .run(input.requestId, user.id, place.id);
      if (input.firstHour !== null)
        this.store.reportPrice(
          place.id,
          token,
          input.firstHour,
          input.nextHour ?? input.firstHour,
        );
      this.store.db.exec("COMMIT");
      return place;
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
  }
  label(id: string, token: string, code: string) {
    const user = this.store.session(token);
    this.store.place(id);
    this.store.db
      .prepare(
        "INSERT INTO labels VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET code=excluded.code,created=excluded.created",
      )
      .run(id, user.id, normalizeZoneCode(code), Date.now());
    return { saved: true };
  }
  boundary(id: string, token: string, geometry: Geometry) {
    this.store.session(token);
    this.store.place(id);
    // Separate from the source catalog: importing official data must not erase edits.
    this.store.db.prepare("INSERT INTO boundaries VALUES (?,?,?) ON CONFLICT(place_id) DO UPDATE SET geometry=excluded.geometry,updated=excluded.updated")
      .run(id, JSON.stringify(geometry), Date.now());
    return { saved: true };
  }
  upload(id: string, token: string, photo: PhotoUpload) {
    const user = this.store.session(token);
    this.store.place(id);
    const bytes = Buffer.from(photo.base64, "base64");
    const valid =
      photo.mimeType === "image/jpeg"
        ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
          bytes.subarray(-2).equals(Buffer.from([255, 217]))
        : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (
      !valid ||
      bytes.length < 32 ||
      bytes.length > 2 * 1024 * 1024 ||
      bytes.toString("base64") !== photo.base64
    )
      throw Object.assign(new Error("Use a JPEG or PNG photo under 2 MB."), {
        statusCode: 400,
      });
    const hash = createHash("sha256").update(bytes).digest("hex");
    const prior = this.store.db
      .prepare("SELECT id FROM sign_photos WHERE place_id=? AND hash=?")
      .get(id, hash) as { id: string } | undefined;
    if (prior) return this.photo(prior.id);
    const count = this.store.db
      .prepare("SELECT COUNT(*) AS n FROM sign_photos WHERE place_id=?")
      .get(id) as { n: number };
    if (count.n >= 30)
      throw Object.assign(
        new Error("This location already has 30 sign photos."),
        { statusCode: 409 },
      );
    const photoId = randomUUID();
    // Identical images can reuse a validated extraction, even across locations.
    const cached = this.store.db
      .prepare(
        "SELECT info,model,status FROM sign_photos WHERE hash=? AND status IN ('ready','review') LIMIT 1",
      )
      .get(hash) as { info: string; model: string; status: string } | undefined;
    this.store.db
      .prepare(
        "INSERT INTO sign_photos(id,place_id,session_id,hash,mime,bytes,created,status,info,model) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        photoId,
        id,
        user.id,
        hash,
        photo.mimeType,
        bytes,
        Date.now(),
        cached?.status ?? "queued",
        cached?.info ?? null,
        cached?.model ?? null,
      );
    return this.photo(photoId);
  }
  private view(row: PhotoRow): SignPhoto {
    return {
      id: row.id,
      placeId: row.place_id,
      createdAt: new Date(row.created).toISOString(),
      status: row.status,
      info: row.info ? JSON.parse(row.info) : null,
      model: row.model,
    };
  }
  photo(id: string) {
    const row = this.store.db
      .prepare(
        "SELECT id,place_id,created,status,info,model FROM sign_photos WHERE id=?",
      )
      .get(id) as PhotoRow | undefined;
    if (!row)
      throw Object.assign(new Error("Photo not found."), { statusCode: 404 });
    return this.view(row);
  }
  photos(id: string) {
    this.store.place(id);
    return (
      this.store.db
        .prepare(
          "SELECT id,place_id,created,status,info,model FROM sign_photos WHERE place_id=? ORDER BY created DESC",
        )
        .all(id) as PhotoRow[]
    ).map((row) => this.view(row));
  }
  image(id: string) {
    this.photo(id);
    return this.store.db
      .prepare("SELECT mime,bytes,hash FROM sign_photos WHERE id=?")
      .get(id) as { mime: string; bytes: Uint8Array; hash: string };
  }
  enrich(places: ParkingPlace[]) {
    const boundaries = new Map((this.store.db.prepare("SELECT place_id,geometry FROM boundaries").all() as { place_id: string; geometry: string }[])
      .map(row => [row.place_id, JSON.parse(row.geometry) as Geometry]));
    const labels = this.store.db
      .prepare("SELECT place_id,code FROM labels ORDER BY created DESC")
      .all() as { place_id: string; code: string }[];
    const latest = new Map<string, string>();
    for (const l of labels)
      if (!latest.has(l.place_id)) latest.set(l.place_id, l.code);
    const photos = this.store.db
      .prepare(
        "SELECT id,place_id,created,status,info,model FROM sign_photos ORDER BY created DESC",
      )
      .all() as PhotoRow[];
    const counts = new Map<string, number>(),
      signs = new Map<string, PhotoRow>();
    for (const photo of photos) {
      counts.set(photo.place_id, (counts.get(photo.place_id) ?? 0) + 1);
      if (photo.status === "ready" && !signs.has(photo.place_id))
        signs.set(photo.place_id, photo);
    }
    return places.map((place) => {
      const photo = signs.get(place.id),
        info: SignInfo | null = photo?.info ? JSON.parse(photo.info) : null,
        label = latest.get(place.id);
      return {
        ...place,
        ...(boundaries.has(place.id) ? {
          geometry: boundaries.get(place.id),
          coordinate: place.kind === "zone" ? {
            latitude: boundaries.get(place.id)!.coordinates[0][0][1],
            longitude: boundaries.get(place.id)!.coordinates[0][0][0],
          } : place.coordinate,
          locationPrecision: undefined,
        } : {}),
        photoCount: counts.get(place.id) ?? 0,
        ...(info && photo
          ? {
              signInfo: {
                ...info,
                photoId: photo.id,
                model: photo.model!,
                observedAt: new Date(photo.created).toISOString(),
              },
              ...(!place.zoneCode && info.zoneCode
                ? {
                    zoneCode: normalizeZoneCode(info.zoneCode),
                    zoneCodeEvidence: "sign" as const,
                  }
                : {}),
              ...(!place.openingHours && info.chargingHours
                ? { openingHours: info.chargingHours }
                : {}),
            }
          : {}),
        ...(label
          ? { zoneCode: label, zoneCodeEvidence: "community" as const }
          : {}),
      };
    });
  }
  claim() {
    const now = Date.now();
    return this.store.db
      .prepare(
        `UPDATE sign_photos SET status='processing',attempts=attempts+1,lease_until=? WHERE id=(SELECT id FROM sign_photos WHERE (status IN ('queued','waiting') AND next_attempt<=?) OR (status='processing' AND lease_until<?) ORDER BY created LIMIT 1) RETURNING id,mime,bytes,attempts`,
      )
      .get(now + 120000, now, now) as
      | { id: string; mime: string; bytes: Uint8Array; attempts: number }
      | undefined;
  }
  finish(id: string, info: SignInfo, model: string) {
    const ready = info.isParkingSign && info.confidence >= 0.85;
    this.store.db
      .prepare(
        "UPDATE sign_photos SET status=?,info=?,model=?,lease_until=0 WHERE id=?",
      )
      .run(ready ? "ready" : "review", JSON.stringify(info), model, id);
  }
  defer(id: string, attempts: number, missingKeys = false) {
    this.store.db
      .prepare(
        "UPDATE sign_photos SET status=?,next_attempt=?,lease_until=0 WHERE id=?",
      )
      .run(
        !missingKeys && attempts >= 5 ? "failed" : "waiting",
        Date.now() +
          (missingKeys
            ? 60000
            : Math.min(3600000, 30000 * 2 ** (attempts - 1))),
        id,
      );
    if (missingKeys)
      this.store.db
        .prepare("UPDATE sign_photos SET attempts=MAX(0,attempts-1) WHERE id=?")
        .run(id);
  }
}
