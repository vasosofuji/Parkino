import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { buildApp } from "../server/app";
import { ParkingStore } from "../server/store";
import { PostgresParkingStore } from "../server/postgres/store";
import { postgresSql, type StoreDatabase } from "../server/postgres/database";
import { TERMS_VERSION } from "../src/domain/account";
import { DEFAULT_COSMETICS, PALETTE_COLORS, eligibleCosmetics } from "../src/domain/cosmetics";
import type { Catalog, ParkingPlace } from "../src/domain/types";

const catalog: Catalog = { generatedAt: "2026-10-01T00:00:00Z", places: [], zones: [], destinations: [], coverage: { complete: false, bounds: [], notes: [] } };
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const password = "earned cosmetics test password";
async function fixture(backend: "sqlite" | "postgres") {
  let store: ParkingStore | PostgresParkingStore, pg: PGlite | undefined;
  if (backend === "sqlite") store = new ParkingStore(":memory:", catalog, Date.now, true);
  else {
    pg = await PGlite.create({ parsers: { 20: Number } });
    await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE parkino_api;");
    for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort()) await pg.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const engine = pg, local = new AsyncLocalStorage<Transaction>();
    const db: StoreDatabase = {
      prepare(sql) {
        const query = (values: unknown[]) => (local.getStore() ?? engine).query(postgresSql(sql), values);
        return { run: (...values) => query(values), get: async (...values) => (await query(values)).rows[0], all: async (...values) => (await query(values)).rows };
      },
      transaction: work => local.getStore() ? work() : engine.transaction(tx => local.run(tx, work)),
      close: () => engine.close(),
    };
    store = new PostgresParkingStore(db, Date.now, true);
  }
  const app = await buildApp(catalog, store, { requireOnboarding: true });
  const token = (await store.createSession()).token;
  const post = (url: string, payload: object, session = token) => app.inject({ method: "POST", url, headers: auth(session), payload });
  const choose = (payload: object, session = token) => app.inject({ method: "PUT", url: "/v1/profile/cosmetics", headers: auth(session), payload });
  return { app, store, pg, token, post, choose };
}

for (const backend of ["sqlite", "postgres"] as const) {
  test(`${backend}: cosmetic unlocks enforce ownership, exact earned thresholds, and preserve guest upgrades`, async () => {
    const { app, store, pg, token, post, choose } = await fixture(backend);
    try {
      assert.equal((await app.inject({ method: "PUT", url: "/v1/profile/cosmetics", payload: { palette: "default" } })).statusCode, 401);
      assert.equal((await choose({ palette: "default" })).statusCode, 403);
      const guest = (await post("/v1/auth/guest", { accepted: true, termsVersion: TERMS_VERSION })).json();
      assert.deepEqual(guest.cosmetics, DEFAULT_COSMETICS);
      assert.equal((await choose({ palette: "default", accent: "default" })).statusCode, 200);
      const otherToken = (await store.createSession()).token;
      const other = (await post("/v1/auth/guest", { accepted: true, termsVersion: TERMS_VERSION }, otherToken)).json();
      for (const invalid of [{ palette: "blue" }, { accent: "<script>" }, { palette: "ocean", points: 999 }, { palette: "ocean", sessionId: other.id }, {}])
        assert.equal((await choose(invalid)).statusCode, 400);
      const contribution = { requestId: "cosmetics", name: "Cosmetic parking", coordinate: { latitude: 41.997, longitude: 21.433 }, kind: "surface", zoneCode: null, firstHour: null, nextHour: null };
      const place = (await post("/v1/contributions", contribution)).json();
      const otherPlace = (await post("/v1/contributions", contribution, otherToken)).json();
      const setPoints = async (total: number) => {
        if (total === 0) { await store.db.prepare("DELETE FROM reward_events WHERE session_id=?").run(guest.id); return; }
        const base = await store.db.prepare("SELECT COALESCE(SUM(points),0) AS total FROM reward_events WHERE session_id=? AND event_key<>?").get(guest.id, "fixture:earned") as { total: number };
        await store.db.prepare("INSERT INTO reward_events VALUES (?,?,?,?,?) ON CONFLICT(session_id,event_key) DO UPDATE SET points=excluded.points")
          .run(guest.id, "fixture:earned", "parking", total - Number(base.total), Date.now());
      };
      for (const [key, value, threshold] of [["palette", "ocean", 40], ["accent", "gold", 100], ["palette", "plum", 120], ["accent", "violet", 250]] as const) {
        await setPoints(threshold - 1);
        assert.equal((await choose({ [key]: value })).statusCode, 403);
        await setPoints(threshold);
        const applied = await choose({ [key]: value });
        assert.equal(applied.statusCode, 200, applied.body);
        assert.equal(applied.json().cosmetics[key], value);
        assert.equal(applied.json().points, threshold, "unlocking never spends earned points");
      }
      assert.deepEqual((await app.inject({ url: "/v1/profile", headers: auth(otherToken) })).json().cosmetics, DEFAULT_COSMETICS);
      const edited = await post(`/v1/places/${otherPlace.id}/labels`, { zoneCode: "A1" });
      assert.equal(edited.statusCode, 200);
      await post(`/v1/places/${place.id}/labels`, { zoneCode: "B2" }, otherToken);
      const places = (await app.inject({ url: "/v1/catalog" })).json().places as ParkingPlace[];
      assert.equal(places.find(p => p.id === place.id)?.contributionAccent, "violet");
      assert.equal(places.find(p => p.id === otherPlace.id)?.contributionAccent, undefined, "editing somebody else's place does not recolor it");
      const upgraded = await post("/v1/profile", { username: "RewardDriver", password, accepted: true, termsVersion: TERMS_VERSION });
      assert.equal(upgraded.statusCode, 200, upgraded.body);
      assert.equal(upgraded.json().id, guest.id);
      assert.deepEqual(upgraded.json().cosmetics, { palette: "plum", accent: "violet" });
      const login = await post("/v1/auth/login", { username: "RewardDriver", password });
      assert.deepEqual(login.json().profile.cosmetics, { palette: "plum", accent: "violet" });
      assert.deepEqual((await choose({ palette: "default", accent: "default" }, login.json().token)).json().cosmetics, DEFAULT_COSMETICS);
      assert.equal((await app.inject({ url: "/v1/catalog" })).json().places.find((p: ParkingPlace) => p.id === place.id).contributionAccent, undefined);
      await setPoints(0);
      assert.equal((await choose({ palette: "default", accent: "default" })).statusCode, 200, "reset is free even at zero points");
      await store.db.prepare("UPDATE account_cosmetics SET palette=?,accent=? WHERE session_id=?").run("plum", "violet", guest.id);
      assert.deepEqual((await app.inject({ url: "/v1/profile", headers: auth(token) })).json().cosmetics, DEFAULT_COSMETICS, "ineligible stored choices fail closed");
      assert.equal((await app.inject({ url: "/v1/catalog" })).json().places.find((p: ParkingPlace) => p.id === place.id).contributionAccent, undefined);
      if (pg) {
        const permissions = (await pg.query(`SELECT c.relrowsecurity AS rls,
          has_table_privilege('anon','parkskopje.account_cosmetics','SELECT') AS anonymous,
          has_table_privilege('authenticated','parkskopje.account_cosmetics','UPDATE') AS client,
          has_table_privilege('parkino_api','parkskopje.account_cosmetics','UPDATE') AS api
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='parkskopje' AND c.relname='account_cosmetics'`)).rows[0];
        assert.deepEqual(permissions, { rls: true, anonymous: false, client: false, api: true });
      }
      assert.equal((await app.inject({ method: "DELETE", url: "/v1/sessions/me", headers: auth(token) })).statusCode, 200);
      assert.equal(Number((await store.db.prepare("SELECT COUNT(*) AS n FROM account_cosmetics WHERE session_id=?").get(guest.id) as { n: number }).n), 0);
    } finally { await app.close(); }
  });

  test(`${backend}: login renews old Terms only after explicit current consent`, async () => {
    const { app, store, post } = await fixture(backend);
    try {
      const profile = (await post("/v1/profile", { username: "TermsDriver", password, accepted: true, termsVersion: TERMS_VERSION })).json();
      await store.db.prepare("UPDATE profiles SET terms_version=? WHERE session_id=?").run("old", profile.id);
      const legacy = await post("/v1/auth/login", { username: "TermsDriver", password });
      assert.equal(legacy.json().profile.termsVersion, "old");
      for (const consent of [{ accepted: true }, { termsVersion: TERMS_VERSION }, { accepted: true, termsVersion: "old" }, { accepted: false, termsVersion: TERMS_VERSION }])
        assert.equal((await post("/v1/auth/login", { username: "TermsDriver", password, ...consent })).statusCode, 400);
      const current = await post("/v1/auth/login", { username: "TermsDriver", password, accepted: true, termsVersion: TERMS_VERSION });
      assert.equal(current.statusCode, 200, current.body);
      assert.equal(current.json().profile.termsVersion, TERMS_VERSION);
    } finally { await app.close(); }
  });
}

test("palette text stays readable and semantic status colors cannot be replaced by cosmetic palettes", () => {
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const modes of Object.values(PALETTE_COLORS)) for (const colors of Object.values(modes)) {
    assert.ok(contrast(colors.ink, colors.paper) >= 4.5);
    assert.ok(contrast(colors.muted, colors.paper) >= 4.5);
    assert.ok(contrast("#FFFFFF", colors.green) >= 4.5, `${colors.green} button text contrast`);
    for (const surface of [colors.paper, colors.mint, colors.input])
      assert.ok(contrast(colors.accentText, surface) >= 4.5, `${colors.accentText} small text on ${surface}`);
    assert.equal("red" in colors || "success" in colors || "amber" in colors, false);
  }
  assert.deepEqual(eligibleCosmetics(1000, "__proto__", "constructor"), DEFAULT_COSMETICS);
});
