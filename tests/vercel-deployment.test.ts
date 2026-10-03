import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { postgresSql, type StoreDatabase } from "../server/postgres/database";
import { SharedRequestBudget, sharedRateLimitStore } from "../server/postgres/rate-limits";
import { SignWorker, SignExtractor } from "../server/sign-ai";
import { CommunityStore } from "../server/community";
import { ParkingStore } from "../server/store";
import { buildApp } from "../server/app";
import seed from "../data/catalog.json";
import type { Catalog } from "../src/domain/types";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

test("rate budgets survive another function instance and reset after expiry", async () => {
  const pg = new PGlite();
  await pg.exec("CREATE SCHEMA parkskopje; SET search_path TO parkskopje;");
  await pg.exec(readFileSync("supabase/migrations/20261003101436_shared_request_limits.sql", "utf8"));
  const db: StoreDatabase = {
    prepare: sql => ({
      run: (...values) => pg.query(postgresSql(sql), values),
      get: async (...values) => (await pg.query(postgresSql(sql), values)).rows[0],
      all: async (...values) => (await pg.query(postgresSql(sql), values)).rows,
    }),
    transaction: work => work(), close: () => pg.close(),
  };
  const first = new SharedRequestBudget(db), second = new SharedRequestBudget(db);
  try {
    await first.consume("login", "person", 2, 60000);
    await second.consume("login", "person", 2, 60000);
    await assert.rejects(first.consume("login", "person", 2, 60000), { statusCode: 429 });
    const rows = (await pg.query<{ key: string }>("SELECT key FROM request_limits")).rows;
    assert.equal(rows[0].key.includes("person"), false);
    await pg.exec("UPDATE request_limits SET expires=0");
    await second.consume("login", "person", 2, 60000);
    const Store = sharedRateLimitStore(first);
    const root = new Store({}), route = root.child({ path: "/login", prefix: "" } as never);
    const increment = (store: typeof root | typeof route) => new Promise<number>((resolve, reject) =>
      store.incr("client", (error, result) => error ? reject(error) : resolve(Number(result!.current)), 60000, 2));
    assert.equal(await increment(root), 1);
    assert.equal(await increment(root), 2);
    assert.equal(await increment(route), 1);
    const app = Fastify();
    await app.register(rateLimit, { store: Store, max: 100, timeWindow: 60000 });
    app.get("/one", { config: { rateLimit: { max: 1 } } }, async () => ({ ok: true }));
    app.get("/two", { config: { rateLimit: { max: 2 } } }, async () => ({ ok: true }));
    try {
      assert.equal((await app.inject("/one")).statusCode, 200);
      assert.equal((await app.inject("/one")).statusCode, 429);
      assert.equal((await app.inject("/two")).statusCode, 200, "route budgets do not collide");
      assert.equal((await app.inject("/two")).statusCode, 200);
      assert.equal((await app.inject("/two")).statusCode, 429);
    } finally { await app.close(); }
    await pg.exec("UPDATE request_limits SET expires=0");
    await second.prune();
    assert.equal((await pg.query("SELECT * FROM request_limits")).rows.length, 0);
  } finally { await pg.close(); }
});

test("function sign worker drains only the requested number of durable jobs without a timer", async t => {
  const store = new ParkingStore(":memory:", seed as Catalog);
  const community = new CommunityStore(store);
  const claim = t.mock.method(community, "claim", () => ({ id: "job", attempts: 1, bytes: new Uint8Array(), mime: "image/jpeg" }));
  const defer = t.mock.method(community, "defer", () => {});
  const worker = new SignWorker(community, new SignExtractor());
  try {
    const first = worker.wake(2);
    assert.equal(worker.wake(2), first, "concurrent requests share the active drain");
    await first;
    assert.equal(claim.mock.callCount(), 2);
    assert.equal(defer.mock.callCount(), 2);
    await worker.wake(1);
    assert.equal(claim.mock.callCount(), 3);
  } finally { await worker.stop(); store.close(); }
});

test("function responses retain background work; cron requires its own secret", async () => {
  const tasks: Promise<void>[] = [];
  const store = new ParkingStore(":memory:", seed as Catalog);
  const app = await buildApp(seed as Catalog, store, {
    signExtractor: new SignExtractor(), backgroundTask: task => { tasks.push(task); }, cronSecret: "private-cron-secret",
  });
  try {
    assert.equal((await app.inject("/health")).statusCode, 200);
    assert.ok(tasks.length > 0);
    assert.equal((await app.inject("/internal/sign-jobs")).statusCode, 401);
    assert.equal((await app.inject({ url: "/internal/sign-jobs", headers: { authorization: "Bearer private-cron-secret" } })).statusCode, 200);
    await Promise.all(tasks);
  } finally { await app.close(); }
});
