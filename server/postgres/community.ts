import type { RewardKind } from "../../src/domain/account";
import { CONTRIBUTION_COSMETICS_QUERY, contributionAccents, type ContributionCosmeticRow } from "../cosmetics";
import { createHash, randomUUID } from "node:crypto";
import type {
  Contribution,
  Geometry,
  ParkingPlace,
  PhotoUpload,
  SignInfo,
  SignPhoto,
} from "../../src/domain/types";
import { normalizeZoneCode } from "../../src/domain/parking";
import type { PostgresParkingStore } from "./store";
import { PHOTO_SELECT, photoView, enrichSigns, type PhotoRow } from "../sign-catalog";
export class PostgresCommunityStore {
  constructor(private store: PostgresParkingStore) {}

  async contribute(input: Contribution, token: string) {
    const user = await this.store.session(token);
    const previous = (await this.store.db
      .prepare(
        "SELECT place_id FROM contributions WHERE request_id=? AND session_id=?",
      )
      .get(input.requestId, user.id)) as
      | {
          place_id: string;
        }
      | undefined;
    if (previous) return await this.store.place(previous.place_id);
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
    return await this.store.db.transaction(async () => {
      // Serialize retries from one device; a timed-out POST must not add a second zone.
      await this.store.db
        .prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE")
        .get(user.id);
      const retry = (await this.store.db
        .prepare(
          "SELECT place_id FROM contributions WHERE request_id=? AND session_id=?",
        )
        .get(input.requestId, user.id)) as { place_id: string } | undefined;
      if (retry) return await this.store.place(retry.place_id);
      await this.store.db
        .prepare("INSERT INTO places VALUES (?,?)")
        .run(place.id, JSON.stringify(place));
      await this.store.db
        .prepare("INSERT INTO contributions VALUES (?,?,?)")
        .run(input.requestId, user.id, place.id);
      const kinds: RewardKind[] = [];
      if (input.geometry) kinds.push("boundary");
      if (input.firstHour !== null) kinds.push("pricing");
      if (input.capacity != null) kinds.push("capacity");
      if (input.freeSpaces != null && input.kind !== "zone") kinds.push("availability");
      await this.store.db.prepare("INSERT INTO contribution_details(place_id,session_id,details,created) VALUES (?,?,?,?)")
        .run(place.id,user.id,JSON.stringify(kinds),Date.now());
      if (input.firstHour !== null)
        await this.store.reportPrice(
          place.id,
          token,
          input.firstHour,
          input.nextHour ?? input.firstHour,
        );
      if (input.freeSpaces !== undefined && input.freeSpaces !== null && input.kind !== "zone")
        await this.store.report(place.id, token, input.freeSpaces > 0 ? "spaces" : "full", input.freeSpaces);
      return place;
    });
  }
  async contributionRewards(id: string, token: string) {
    const user = await this.store.session(token);
    const row = (await this.store.db.prepare("SELECT details,created FROM contribution_details WHERE place_id=? AND session_id=?").get(id,user.id)) as {details:string;created:number}|undefined;
    return {kinds: row ? JSON.parse(row.details) as RewardKind[] : [], created: row?.created ?? Date.now()};
  }
  async label(id: string, token: string, code: string) {
    const user = await this.store.session(token);
    await this.store.place(id);
    await this.store.db
      .prepare(
        "INSERT INTO labels VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET code=excluded.code,created=excluded.created",
      )
      .run(id, user.id, normalizeZoneCode(code), Date.now());
    return { saved: true };
  }
  async boundary(id: string, token: string, geometry: Geometry) {
    await this.store.session(token);
    await this.store.place(id);
    // Separate from the source catalog: importing official data must not erase edits.
    await this.store.db
      .prepare(
        "INSERT INTO boundaries VALUES (?,?,?) ON CONFLICT(place_id) DO UPDATE SET geometry=excluded.geometry,updated=excluded.updated",
      )
      .run(id, JSON.stringify(geometry), Date.now());
    return { saved: true };
  }
  async capacity(id: string, token: string, capacity: number) {
    const user = await this.store.session(token);
    const place = await this.store.place(id);
    if (place.kind === "zone") throw Object.assign(new Error("Set capacity on an individual parking area."), {statusCode:400});
    await this.store.db.prepare("INSERT INTO capacity_reports(place_id,session_id,capacity,updated) VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET capacity=excluded.capacity,updated=excluded.updated").run(id,user.id,capacity,Date.now());
    return {saved:true};
  }
  async upload(id: string, token: string, photo: PhotoUpload) {
    const user = await this.store.session(token);
    await this.store.place(id);
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
    return this.store.db.transaction(async () => {
      await this.store.db
        .prepare("SELECT id FROM places WHERE id=? FOR UPDATE")
        .get(id);
      const prior = (await this.store.db
        .prepare("SELECT id FROM sign_photos WHERE place_id=? AND hash=?")
        .get(id, hash)) as
        | {
            id: string;
          }
        | undefined;
      if (prior) {
        await this.store.db.prepare("INSERT INTO sign_uploaders(photo_id,session_id) VALUES (?,?) ON CONFLICT DO NOTHING").run(prior.id, user.id);
        return await this.photo(prior.id, token);
      }
      const count = (await this.store.db
        .prepare("SELECT COUNT(*) AS n FROM sign_photos WHERE place_id=?")
        .get(id)) as {
        n: number;
      };
      if (count.n >= 30)
        throw Object.assign(
          new Error("This location already has 30 sign photos."),
          { statusCode: 409 },
        );
      const photoId = randomUUID();
      // Identical images can reuse a validated extraction, even across locations.
      const cached = (await this.store.db
        .prepare(
          "SELECT info,model,status FROM sign_photos WHERE hash=? AND status IN ('ready','review') LIMIT 1",
        )
        .get(hash)) as
        | {
            info: string;
            model: string;
            status: string;
          }
        | undefined;
      await this.store.db
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
      return await this.photo(photoId, token);
    });
  }
  async photo(id: string, token?: string): Promise<SignPhoto> {
    const row = (await this.store.db.prepare(PHOTO_SELECT + " WHERE p.id=?").get(id)) as PhotoRow | undefined;
    if (!row) throw Object.assign(new Error("Photo not found."), { statusCode: 404 });
    const user = token ? await this.store.session(token) : undefined;
    const uploaded = user ? (await this.store.db.prepare("SELECT 1 FROM sign_uploaders WHERE photo_id=? AND session_id=?").get(id, user.id)) : undefined;
    return photoView(row, user?.id, Boolean(uploaded));
  }
  async photos(id: string, token?: string): Promise<SignPhoto[]> {
    await this.store.place(id);
    const user = token ? await this.store.session(token) : undefined;
    const rows = (await this.store.db.prepare(PHOTO_SELECT + " WHERE p.place_id=? ORDER BY p.created DESC").all(id)) as PhotoRow[];
    const uploads = user ? (await this.store.db.prepare("SELECT photo_id FROM sign_uploaders WHERE session_id=?").all(user.id)) as { photo_id: string }[] : [];
    const ids = new Set(uploads.map(row => row.photo_id));
    return rows.map(row => photoView(row, user?.id, ids.has(row.id)));
  }
  async confirmSign(id: string, token: string, info: SignInfo): Promise<SignPhoto> {
    const user = await this.store.session(token);
    const photo = await this.photo(id, token);
    if (!photo.uploadedByMe) throw Object.assign(new Error("Upload this sign before confirming its details."), { statusCode: 403 });
    if (!info.isParkingSign) throw Object.assign(new Error("Only parking signs can be confirmed."), { statusCode: 400 });
    await this.store.db.prepare("INSERT INTO sign_confirmations(photo_id,session_id,info,confirmed) VALUES (?,?,?,?) ON CONFLICT(photo_id) DO UPDATE SET session_id=excluded.session_id,info=excluded.info,confirmed=excluded.confirmed")
      .run(id, user.id, JSON.stringify(info), Date.now());
    return await this.photo(id, token);
  }
  async image(id: string) {
    await this.photo(id);
    return (await this.store.db
      .prepare("SELECT mime,bytes,hash FROM sign_photos WHERE id=?")
      .get(id)) as {
      mime: string;
      bytes: Uint8Array;
      hash: string;
    };
  }
  async enrich(places: ParkingPlace[]) {
    const accents = contributionAccents(await this.store.db.prepare(CONTRIBUTION_COSMETICS_QUERY).all() as ContributionCosmeticRow[]);
    const boundaries = (await this.store.db.prepare("SELECT place_id,geometry FROM boundaries").all()) as { place_id: string; geometry: string }[];
    const labels = (await this.store.db.prepare("SELECT place_id,code FROM labels ORDER BY created DESC").all()) as { place_id: string; code: string }[];
    const photos = (await this.store.db.prepare(PHOTO_SELECT + " ORDER BY c.confirmed DESC,p.created DESC").all()) as PhotoRow[];
    const capacities = (await this.store.db.prepare("SELECT place_id,capacity FROM capacity_reports ORDER BY updated DESC,session_id DESC").all()) as {place_id:string;capacity:number}[];
    const latest = new Map<string,number>();
    for (const row of capacities) if (!latest.has(row.place_id)) latest.set(row.place_id,row.capacity);
    return enrichSigns(places.map(place => ({...place,capacity:latest.get(place.id) ?? place.capacity,contributionAccent:accents.get(place.id)})), boundaries, labels, photos);
  }
  async claim() {
    const now = Date.now();
    return (await this.store.db
      .prepare(
        `UPDATE sign_photos SET status='processing',attempts=attempts+1,lease_until=? WHERE id=(SELECT id FROM sign_photos WHERE (status IN ('queued','waiting') AND next_attempt<=?) OR (status='processing' AND lease_until<?) ORDER BY created LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,mime,bytes,attempts`,
      )
      .get(now + 120000, now, now)) as
      | {
          id: string;
          mime: string;
          bytes: Uint8Array;
          attempts: number;
        }
      | undefined;
  }
  async finish(id: string, info: SignInfo, model: string) {
    const ready = info.isParkingSign && info.confidence >= 0.85;
    await this.store.db
      .prepare(
        "UPDATE sign_photos SET status=?,info=?,model=?,lease_until=0 WHERE id=?",
      )
      .run(ready ? "ready" : "review", JSON.stringify(info), model, id);
  }
  async defer(id: string, attempts: number, missingKeys = false) {
    await this.store.db
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
      await this.store.db
        .prepare("UPDATE sign_photos SET attempts=MAX(0,attempts-1) WHERE id=?")
        .run(id);
  }
}
