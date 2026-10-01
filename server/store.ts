import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Catalog,
  Coordinate,
  ParkingPlace,
  Proposal,
  Availability,
} from "../src/domain/types";
import {
  CONSENSUS_VOTES,
  SESSION_MATURITY_MS,
  REPORT_TTL_MS,
  OPERATOR_TTL_MS,
  distanceMeters,
  UNKNOWN_AVAILABILITY,
} from "../src/domain/parking";
export class ParkingStore {
  db: DatabaseSync;
  constructor(
    path: string,
    catalog: Catalog,
    private clock: () => number = Date.now,
    readonly trustInputs = false,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS places(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), status TEXT NOT NULL, observed INTEGER NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS votes(proposal_id TEXT REFERENCES proposals(id), session_id TEXT REFERENCES sessions(id), PRIMARY KEY(proposal_id,session_id));
      CREATE TABLE IF NOT EXISTS price_reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), first_hour REAL NOT NULL, next_hour REAL NOT NULL, observed INTEGER NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS location_reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), present INTEGER NOT NULL, observed INTEGER NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS observations(place_id TEXT PRIMARY KEY REFERENCES places(id), operator TEXT NOT NULL, free_spaces INTEGER NOT NULL, observed INTEGER NOT NULL);`);
    const put = this.db.prepare(
      "INSERT INTO places(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    );
    this.db.exec("BEGIN");
    try {
      for (const place of catalog.places)
        put.run(place.id, JSON.stringify(place));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  createSession() {
    const token = randomBytes(32).toString("hex"),
      id = randomUUID();
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(id, createHash("sha256").update(token).digest("hex"), this.clock());
    return {
      token,
      maturesAt: new Date(this.clock() + (this.trustInputs ? 0 : SESSION_MATURITY_MS)).toISOString(),
    };
  }
  session(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    const row = this.db
      .prepare("SELECT id,created FROM sessions WHERE hash=?")
      .get(hash) as { id: string; created: number } | undefined;
    if (!row)
      throw Object.assign(new Error("A valid session is required."), {
        statusCode: 401,
      });
    return row;
  }
  place(id: string): ParkingPlace {
    const row = this.db
      .prepare("SELECT data FROM places WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (!row)
      throw Object.assign(new Error("Parking location not found."), {
        statusCode: 404,
      });
    return JSON.parse(row.data);
  }
  availability(id: string): Availability {
    const now = this.clock();
    const operator = this.db
      .prepare(
        "SELECT free_spaces,observed FROM observations WHERE place_id=? AND observed>?",
      )
      .get(id, now - OPERATOR_TTL_MS) as
      | { free_spaces: number; observed: number }
      | undefined;
    const rows = this.db
      .prepare(
        "SELECT status,observed FROM reports WHERE place_id=? AND observed>? ORDER BY observed DESC, rowid DESC",
      )
      .all(id, now - REPORT_TTL_MS) as {
      status: "spaces" | "full";
      observed: number;
    }[];
    if (operator && (!this.trustInputs || !rows.length || operator.observed >= rows[0].observed))
      return {
        status: operator.free_spaces > 0 ? "spaces" : "full",
        source: "operator",
        freeSpaces: operator.free_spaces,
        reports: 0,
        observedAt: new Date(operator.observed).toISOString(),
        expiresAt: new Date(operator.observed + OPERATOR_TTL_MS).toISOString(),
      };
    if (!rows.length) return UNKNOWN_AVAILABILITY;
    const spaces = rows.filter((r) => r.status === "spaces").length;
    const status =
      this.trustInputs ? rows[0].status : spaces === rows.length ? "spaces" : spaces === 0 ? "full" : "mixed";
    // Expire the aggregate at the oldest report's expiry so clients cannot keep a stale conflict alive.
    return {
      status,
      source: "community",
      reports: rows.length,
      observedAt: new Date(rows[0].observed).toISOString(),
      expiresAt: new Date(
        rows[this.trustInputs ? 0 : rows.length - 1].observed + REPORT_TTL_MS,
      ).toISOString(),
    };
  }
  publishReadyProposals() {
    const pending = this.db
      .prepare("SELECT id FROM proposals WHERE status='pending'")
      .all() as { id: string }[];
    for (const row of pending) {
      const proposal = this.proposal(row.id);
      if (proposal.eligibleVotes < proposal.requiredVotes) continue;
      this.publishProposal(proposal);
    }
  }
  private publishProposal(proposal: Proposal) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.proposal(proposal.id);
      if (
        current.status === "pending" &&
        current.eligibleVotes >= current.requiredVotes
      ) {
        const place: ParkingPlace = {
          id: "community:" + current.id,
          name: current.name,
          coordinate: current.coordinate,
          kind: current.kind,
          operator: null,
          zoneCode: current.zoneCode,
          access: "unknown",
          tariff: null,
          capacity: null,
          openingHours: null,
          verification: "community",
          source: {
            label: "Community confirmed location; sign and access unverified",
            url: "",
            retrievedAt: new Date(this.clock()).toISOString(),
          },
        };
        this.db
          .prepare("INSERT INTO places VALUES (?,?)")
          .run(place.id, JSON.stringify(place));
        this.db
          .prepare("UPDATE proposals SET status='published' WHERE id=?")
          .run(current.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  places() {
    return (
      this.db.prepare(this.trustInputs ? "SELECT data FROM places WHERE COALESCE((SELECT present FROM location_reports WHERE place_id=places.id ORDER BY observed DESC, rowid DESC LIMIT 1),1)=1" : "SELECT data FROM places").all() as { data: string }[]
    ).map((row) => {
      const place: ParkingPlace = JSON.parse(row.data);
      const prices = this.db
        .prepare(
          "SELECT first_hour,next_hour,observed FROM price_reports WHERE place_id=? AND observed>? ORDER BY observed DESC, rowid DESC",
        )
        .all(this.priceTarget(place), this.clock() - 90 * 86400000) as {
        first_hour: number;
        next_hour: number;
        observed: number;
      }[];
      const confirmations = this.db
        .prepare(
          "SELECT present,COUNT(*) AS n FROM location_reports WHERE place_id=? AND observed>? GROUP BY present",
        )
        .all(place.id, this.clock() - 90 * 86400000) as {
        present: number;
        n: number;
      }[];
      return {
        ...place,
        availability: this.availability(place.id),
        communityPrice: prices.length
          ? {
              firstHour: prices[0].first_hour,
              nextHour: prices[0].next_hour,
              observedAt: new Date(prices[0].observed).toISOString(),
              reports: prices.filter(
                (p) =>
                  p.first_hour === prices[0].first_hour &&
                  p.next_hour === prices[0].next_hour,
              ).length,
            }
          : undefined,
        locationReports: {
          yes: confirmations.find((r) => r.present === 1)?.n ?? 0,
          no: confirmations.find((r) => r.present === 0)?.n ?? 0,
        },
      };
    });
  }
  report(placeId: string, token: string, status: "spaces" | "full") {
    const user = this.session(token),
      place = this.place(placeId);
    if (place.kind === "zone" || place.access === "restricted")
      throw Object.assign(
        new Error("Reports are available for accessible parking locations."),
        { statusCode: 400 },
      );
    this.db
      .prepare(
        "INSERT INTO reports VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET status=excluded.status,observed=excluded.observed",
      )
      .run(placeId, user.id, status, this.clock());
    this.db
      .prepare("DELETE FROM reports WHERE observed<=?")
      .run(this.clock() - REPORT_TTL_MS);
    return this.availability(placeId);
  }
  reportPrice(
    placeId: string,
    token: string,
    firstHour: number,
    nextHour: number,
  ) {
    const user = this.session(token);
    const place = this.place(placeId);
    this.db
      .prepare(
        "INSERT INTO price_reports VALUES (?,?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET first_hour=excluded.first_hour,next_hour=excluded.next_hour,observed=excluded.observed",
      )
      .run(this.priceTarget(place), user.id, firstHour, nextHour, this.clock());
    return { saved: true };
  }
  private priceTarget(place: ParkingPlace): string {
    if (place.kind !== "zone" || !place.zoneCode || !place.operator)
      return place.id;
    const row = this.db
      .prepare(
        "SELECT id FROM places WHERE json_extract(data,'$.kind')='zone' AND json_extract(data,'$.zoneCode')=? AND json_extract(data,'$.operator')=? ORDER BY id LIMIT 1",
      )
      .get(place.zoneCode, place.operator) as { id: string } | undefined;
    return row?.id ?? place.id;
  }
  confirmLocation(placeId: string, token: string, present: boolean) {
    const user = this.session(token),
      place = this.place(placeId);
    if (place.kind === "zone")
      throw Object.assign(
        new Error("Confirm a parking location, not an entire zone."),
        { statusCode: 400 },
      );
    this.db
      .prepare(
        "INSERT INTO location_reports VALUES (?,?,?,?) ON CONFLICT(place_id,session_id) DO UPDATE SET present=excluded.present,observed=excluded.observed",
      )
      .run(placeId, user.id, present ? 1 : 0, this.clock());
    return { saved: true };
  }
  propose(
    input: {
      name: string;
      coordinate: Coordinate;
      kind: Proposal["kind"];
      zoneCode: string | null;
      note: string;
    },
    token: string,
  ) {
    const session = this.session(token);
    const nearby = this.proposals().find(
      (p) =>
        p.status !== "rejected" &&
        distanceMeters(p.coordinate, input.coordinate) < 25,
    );
    if (nearby) return this.vote(nearby.id, token);
    if (
      this.places().some(
        (p) =>
          p.kind !== "zone" &&
          distanceMeters(p.coordinate, input.coordinate) < 15,
      )
    )
      throw Object.assign(
        new Error(
          "A mapped parking location is already here. Select it to report availability.",
        ),
        { statusCode: 409 },
      );
    const id = randomUUID(),
      created = this.clock();
    this.db
      .prepare("INSERT INTO proposals VALUES (?,?,?,?)")
      .run(id, JSON.stringify({ ...input, id }), "pending", created);
    this.db.prepare("INSERT INTO votes VALUES (?,?)").run(id, session.id);
    return this.vote(id, token);
  }
  proposal(id: string): Proposal {
    const row = this.db
      .prepare("SELECT data,status,created FROM proposals WHERE id=?")
      .get(id) as
      | { data: string; status: Proposal["status"]; created: number }
      | undefined;
    if (!row)
      throw Object.assign(new Error("Proposal not found."), {
        statusCode: 404,
      });
    const total = this.db
      .prepare("SELECT COUNT(*) AS n FROM votes WHERE proposal_id=?")
      .get(id) as { n: number };
    const eligible = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM votes JOIN sessions ON sessions.id=votes.session_id WHERE proposal_id=? AND sessions.created<=?",
      )
      .get(id, this.clock() - SESSION_MATURITY_MS) as { n: number };
    return {
      ...JSON.parse(row.data),
      status: row.status,
      createdAt: new Date(row.created).toISOString(),
      votes: total.n,
      eligibleVotes: this.trustInputs ? total.n : eligible.n,
      requiredVotes: this.trustInputs ? 1 : CONSENSUS_VOTES,
    };
  }
  proposals() {
    return (
      this.db
        .prepare("SELECT id FROM proposals ORDER BY created DESC")
        .all() as { id: string }[]
    ).map((row) => this.proposal(row.id));
  }
  vote(id: string, token: string) {
    const user = this.session(token),
      proposal = this.proposal(id);
    if (proposal.status !== "pending") return proposal;
    this.db
      .prepare("INSERT OR IGNORE INTO votes VALUES (?,?)")
      .run(id, user.id);
    this.publishProposal(this.proposal(id));
    return this.proposal(id);
  }

  observe(
    operator: string,
    input: { placeId: string; freeSpaces: number; observedAt: string }[],
  ) {
    const now = this.clock();
    for (const observation of input) {
      const place = this.place(observation.placeId),
        observed = Date.parse(observation.observedAt);
      if (place.operator !== operator || place.kind === "zone")
        throw Object.assign(
          new Error("Feed cannot update a location owned by another operator."),
          { statusCode: 403 },
        );
      if (observed > now + 30_000 || observed <= now - OPERATOR_TTL_MS)
        throw Object.assign(
          new Error("Observation must be fresh and cannot be in the future."),
          { statusCode: 400 },
        );
      if (place.capacity !== null && observation.freeSpaces > place.capacity)
        throw Object.assign(new Error("Free spaces exceed capacity."), {
          statusCode: 400,
        });
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const update = this.db.prepare(
        "INSERT INTO observations VALUES (?,?,?,?) ON CONFLICT(place_id) DO UPDATE SET free_spaces=excluded.free_spaces,observed=excluded.observed,operator=excluded.operator WHERE excluded.observed>observations.observed",
      );
      for (const observation of input)
        update.run(
          observation.placeId,
          operator,
          observation.freeSpaces,
          Date.parse(observation.observedAt),
        );
      this.db.exec("COMMIT");
      return { accepted: input.length };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  moderate(id: string) {
    this.proposal(id);
    this.db
      .prepare("UPDATE proposals SET status='rejected' WHERE id=?")
      .run(id);
    this.db
      .prepare("DELETE FROM reports WHERE place_id=?")
      .run("community:" + id);
    this.db
      .prepare("DELETE FROM observations WHERE place_id=?")
      .run("community:" + id);
    this.db
      .prepare("DELETE FROM price_reports WHERE place_id=?")
      .run("community:" + id);
    this.db
      .prepare("DELETE FROM location_reports WHERE place_id=?")
      .run("community:" + id);
    this.db.prepare("DELETE FROM places WHERE id=?").run("community:" + id);
    return this.proposal(id);
  }
  deleteSession(token: string) {
    const user = this.session(token);
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM reports WHERE session_id=?").run(user.id);
      this.db.prepare("DELETE FROM votes WHERE session_id=?").run(user.id);
      this.db
        .prepare("DELETE FROM price_reports WHERE session_id=?")
        .run(user.id);
      this.db
        .prepare("DELETE FROM location_reports WHERE session_id=?")
        .run(user.id);
      this.db.prepare("DELETE FROM sessions WHERE id=?").run(user.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
