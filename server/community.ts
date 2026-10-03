import type { RewardKind } from "../src/domain/account";
import { CONTRIBUTION_COSMETICS_QUERY, contributionAccents, type ContributionCosmeticRow } from "./cosmetics";
import { createHash, randomUUID } from "node:crypto";
import type {
  Contribution,
  Geometry,
  ParkingPlace,
  PaymentSchedule,
  PhotoUpload,
  SignInfo,
  SignPhoto,
} from "../src/domain/types";
import { normalizeZoneCode } from "../src/domain/parking";
import type { ParkingStore } from "./store";
import { ACCOUNT_TABLES } from "./accounts";
import { PHOTO_SELECT, photoView, enrichSigns, type PhotoRow } from "./sign-catalog";
export class CommunityStore {
  constructor(private store: ParkingStore) {
    store.db.exec(ACCOUNT_TABLES);
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS payment_schedules(place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,details TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS capacity_reports(place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,capacity INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS contribution_details(place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,details TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS contributions(request_id TEXT NOT NULL, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, place_id TEXT REFERENCES places(id) ON DELETE CASCADE, UNIQUE(request_id,session_id));
      CREATE TABLE IF NOT EXISTS labels(place_id TEXT REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, code TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE INDEX IF NOT EXISTS labels_by_place ON labels(place_id,created DESC);
      CREATE TABLE IF NOT EXISTS boundaries(place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE, geometry TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sign_photos(id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, hash TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued', info TEXT, model TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, UNIQUE(place_id,hash));
      CREATE INDEX IF NOT EXISTS photos_by_place ON sign_photos(place_id,created DESC);
      CREATE INDEX IF NOT EXISTS photo_jobs ON sign_photos(status,next_attempt);
      CREATE TABLE IF NOT EXISTS sign_confirmations(photo_id TEXT PRIMARY KEY REFERENCES sign_photos(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, info TEXT NOT NULL, confirmed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sign_uploaders(photo_id TEXT NOT NULL REFERENCES sign_photos(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, PRIMARY KEY(photo_id,session_id));
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
      capacity: input.capacity ?? null,
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
      const kinds: RewardKind[] = [];
      if (input.geometry) kinds.push("boundary");
      if (input.firstHour !== null) kinds.push("pricing");
      if (input.capacity != null) kinds.push("capacity");
      if (input.freeSpaces != null && input.kind !== "zone") kinds.push("availability");
      this.store.db.prepare("INSERT INTO contribution_details(place_id,session_id,details,created) VALUES (?,?,?,?)")
        .run(place.id,user.id,JSON.stringify(kinds),Date.now());
      if (input.firstHour !== null)
        this.store.reportPrice(
          place.id,
          token,
          input.firstHour,
          input.nextHour ?? input.firstHour,
        );
      if (input.freeSpaces !== undefined && input.freeSpaces !== null && input.kind !== "zone")
        this.store.report(place.id, token, input.freeSpaces > 0 ? "spaces" : "full", input.freeSpaces);
      this.store.db.exec("COMMIT");
      return place;
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
  }
  contributionRewards(id: string, token: string) {
    const user = this.store.session(token);
    const row = this.store.db.prepare("SELECT details,created FROM contribution_details WHERE place_id=? AND session_id=?").get(id,user.id) as {details:string;created:number}|undefined;
    return {kinds: row ? JSON.parse(row.details) as RewardKind[] : [], created: row?.created ?? Date.now()};
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
  paymentSchedule(id: string, token: string, value: PaymentSchedule) {
    const user = this.store.session(token);
    this.store.place(id);
    this.store.db.prepare("INSERT INTO payment_schedules(place_id,session_id,details,updated) VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET details=excluded.details,updated=excluded.updated").run(id,user.id,JSON.stringify(value),Date.now());
    return { ok: true };
  }
  capacity(id: string, token: string, capacity: number) {
    const user = this.store.session(token);
    const place = this.store.place(id);
    if (place.kind === "zone") throw Object.assign(new Error("Set capacity on an individual parking area."), {statusCode:400});
    this.store.db.prepare("INSERT INTO capacity_reports(place_id,session_id,capacity,updated) VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET capacity=excluded.capacity,updated=excluded.updated").run(id,user.id,capacity,Date.now());
    return {saved:true};
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
    if (prior) {
        this.store.db.prepare("INSERT INTO sign_uploaders(photo_id,session_id) VALUES (?,?) ON CONFLICT DO NOTHING").run(prior.id, user.id);
        return this.photo(prior.id, token);
      }
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
    return this.photo(photoId, token);
  }
  photo(id: string, token?: string): SignPhoto {
    const row = this.store.db.prepare(PHOTO_SELECT + " WHERE p.id=?").get(id) as PhotoRow | undefined;
    if (!row) throw Object.assign(new Error("Photo not found."), { statusCode: 404 });
    const user = token ? this.store.session(token) : undefined;
    const uploaded = user ? this.store.db.prepare("SELECT 1 FROM sign_uploaders WHERE photo_id=? AND session_id=?").get(id, user.id) : undefined;
    return photoView(row, user?.id, Boolean(uploaded));
  }
  photos(id: string, token?: string): SignPhoto[] {
    this.store.place(id);
    const user = token ? this.store.session(token) : undefined;
    const rows = this.store.db.prepare(PHOTO_SELECT + " WHERE p.place_id=? ORDER BY p.created DESC").all(id) as PhotoRow[];
    const uploads = user ? this.store.db.prepare("SELECT photo_id FROM sign_uploaders WHERE session_id=?").all(user.id) as { photo_id: string }[] : [];
    const ids = new Set(uploads.map(row => row.photo_id));
    return rows.map(row => photoView(row, user?.id, ids.has(row.id)));
  }
  confirmSign(id: string, token: string, info: SignInfo): SignPhoto {
    const user = this.store.session(token);
    const photo = this.photo(id, token);
    if (!photo.uploadedByMe) throw Object.assign(new Error("Upload this sign before confirming its details."), { statusCode: 403 });
    if (!info.isParkingSign) throw Object.assign(new Error("Only parking signs can be confirmed."), { statusCode: 400 });
    this.store.db.prepare("INSERT INTO sign_confirmations(photo_id,session_id,info,confirmed) VALUES (?,?,?,?) ON CONFLICT(photo_id) DO UPDATE SET session_id=excluded.session_id,info=excluded.info,confirmed=excluded.confirmed")
      .run(id, user.id, JSON.stringify(info), Date.now());
    return this.photo(id, token);
  }
  image(id: string) {
    this.photo(id);
    return this.store.db
      .prepare("SELECT mime,bytes,hash FROM sign_photos WHERE id=?")
      .get(id) as { mime: string; bytes: Uint8Array; hash: string };
  }
  enrich(places: ParkingPlace[]) {
    const accents = contributionAccents(this.store.db.prepare(CONTRIBUTION_COSMETICS_QUERY).all() as ContributionCosmeticRow[]);
    const boundaries = this.store.db.prepare("SELECT place_id,geometry FROM boundaries").all() as { place_id: string; geometry: string }[];
    const labels = this.store.db.prepare("SELECT place_id,code FROM labels ORDER BY created DESC").all() as { place_id: string; code: string }[];
    const photos = this.store.db.prepare(PHOTO_SELECT + " ORDER BY c.confirmed DESC,p.created DESC").all() as PhotoRow[];
    const capacities = this.store.db.prepare("SELECT place_id,capacity FROM capacity_reports ORDER BY updated DESC,session_id DESC").all() as {place_id:string;capacity:number}[];
    const latest = new Map<string,number>();
    for (const row of capacities) if (!latest.has(row.place_id)) latest.set(row.place_id,row.capacity);
    const schedules = (this.store.db.prepare("SELECT place_id,details FROM payment_schedules ORDER BY updated DESC,session_id DESC").all()) as {place_id:string;details:string}[];
    const payments = new Map<string, PaymentSchedule>();
    for (const row of schedules) if (!payments.has(row.place_id)) payments.set(row.place_id, JSON.parse(row.details));
    return enrichSigns(places.map(place => ({...place,paymentSchedule:payments.get(place.id) ?? place.paymentSchedule,capacity:latest.get(place.id) ?? place.capacity,contributionAccent:accents.get(place.id)})), boundaries, labels, photos);
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
