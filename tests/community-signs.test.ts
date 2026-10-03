import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ParkingStore } from "../server/store";
import { CommunityStore } from "../server/community";
import { buildApp } from "../server/app";
import {
  DEFAULT_GEMINI_MODELS,
  SignExtractor,
  SignWorker,
} from "../server/sign-ai";
import { parkingPrice } from "../src/domain/parking";
import { validZone, zoneGeometry } from "../src/domain/geometry";
import type { Catalog, Contribution, SignInfo } from "../src/domain/types";
const catalog: Catalog = {
  generatedAt: new Date().toISOString(),
  places: [],
  zones: [],
  destinations: [],
  coverage: { complete: false, bounds: [], notes: [] },
};
const points = [
  { latitude: 41.996, longitude: 21.432 },
  { latitude: 41.997, longitude: 21.432 },
  { latitude: 41.997, longitude: 21.433 },
  { latitude: 41.996, longitude: 21.433 },
];
const contribution: Contribution = {
  requestId: "test-request-123",
  name: "Test parking zone",
  coordinate: points[0],
  geometry: zoneGeometry(points),
  kind: "zone",
  zoneCode: "Б2",
  firstHour: 0,
  nextHour: 0,
};
const photo = {
  mimeType: "image/png" as const,
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGqkAAAAASUVORK5CYII=",
};
const info: SignInfo = {
  isParkingSign: true,
  confidence: 0.96,
  zoneCode: "B2",
  operator: "Gradski",
  currency: "MKD",
  firstHour: 40,
  nextHour: 40,
  maxStayMinutes: null,
  chargingHours: "Mon–Sat 07:00–23:00",
  paymentInstructions: "SMS 144144",
  restrictions: null,
  rawText: "B2 40 ден/час",
};
test("drawn zones, free prices, labels, photos and queued jobs survive database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parking-db-")),
    file = join(directory, "parking.sqlite");
  let store = new ParkingStore(file, catalog),
    app = await buildApp(catalog, store);
  try {
    const session = await app.inject({ method: "POST", url: "/v1/sessions" });
    assert.equal(session.statusCode, 201, session.body);
    const token = session.json().token,
      headers = { authorization: `Bearer ${token}` };
    const response = await app.inject({
      method: "POST",
      url: "/v1/contributions",
      headers,
      payload: contribution,
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().id;
    const moved = zoneGeometry(points.map((p, i) => i === 1 ? { ...p, latitude: p.latitude + 0.0002 } : p));
    const secondUser = (await app.inject({ method: "POST", url: "/v1/sessions" })).json().token;
    const boundaryResponse = await app.inject({
      method: "PUT", url: `/v1/places/${id}/boundary`,
      headers: { authorization: `Bearer ${secondUser}` }, payload: moved,
    });
    assert.equal(boundaryResponse.statusCode, 200, boundaryResponse.body);
    assert.deepEqual((await app.inject("/v1/catalog")).json().places[0].geometry, moved);
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/contributions",
      headers,
      payload: contribution,
    });
    assert.equal(duplicate.json().id, id);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/places/${id}/labels`,
          headers,
          payload: { zoneCode: "D42" },
        })
      ).statusCode,
      200,
    );
    const upload = await app.inject({
      method: "POST",
      url: `/v1/places/${id}/signs`,
      headers,
      payload: photo,
    });
    assert.equal(upload.statusCode, 201, upload.body);
    const signId = upload.json().id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/places/${id}/signs`,
          headers,
          payload: photo,
        })
      ).json().id,
      signId,
    );
    await app.close();
    store = new ParkingStore(file, catalog);
    app = await buildApp(catalog, store);
    const saved = (await app.inject("/v1/catalog")).json().places[0];
    assert.equal(saved.zoneCode, "D42");
    assert.equal(saved.communityPrice.firstHour, 0);
    assert.equal(saved.photoCount, 1);
    assert.deepEqual(saved.geometry, moved, "another user's boundary edit survives restart and is public");
    const image = await app.inject(`/v1/signs/${signId}/image`);
    assert.equal(image.headers["content-type"], "image/png");
    assert.deepEqual(image.rawPayload, Buffer.from(photo.base64, "base64"));
    const community = new CommunityStore(store),
      job = community.claim();
    assert.equal(job?.id, signId);
    assert.equal(community.claim(), undefined);
    community.finish(signId, info, "gemini-3.8-flash");
    assert.equal(community.enrich(store.places())[0].signInfo, undefined, "AI output stays a draft until confirmed");
    community.confirmSign(signId, token, info);
    const updated = community.enrich(store.places())[0];
    assert.equal(updated.signInfo?.chargingHours, info.chargingHours);
    assert.equal(updated.zoneCode, "D42");
    assert.equal(
      parkingPrice(updated)?.firstHour,
      0,
      "human price takes precedence",
    );
    await app.inject({ method: "DELETE", url: "/v1/sessions/me", headers });
    assert.equal(community.photos(id).length, 0);
    assert.equal(community.enrich(store.places())[0].zoneCode, "B2");
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("contributions reject bad geometry, unauthenticated writes and invalid photos", async () => {
  const store = new ParkingStore(":memory:", catalog),
    app = await buildApp(catalog, store),
    token = store.createSession().token,
    headers = { authorization: `Bearer ${token}` };
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/contributions",
          payload: contribution,
        })
      ).statusCode,
      401,
    );
    const crossing = zoneGeometry([points[0], points[2], points[1], points[3]]);
    assert.equal(validZone(crossing), false);
    for (const geometry of [
      crossing,
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    ])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/contributions",
            headers,
            payload: { ...contribution, geometry },
          })
        ).statusCode,
        400,
      );
    const id = (
      await app.inject({
        method: "POST",
        url: "/v1/contributions",
        headers,
        payload: contribution,
      })
    ).json().id;
    assert.equal((await app.inject({ method: "PUT", url: `/v1/places/${id}/boundary`, payload: contribution.geometry })).statusCode, 401);
    assert.equal((await app.inject({ method: "PUT", url: `/v1/places/${id}/boundary`, headers, payload: crossing })).statusCode, 400);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/places/${id}/signs`,
          headers,
          payload: {
            ...photo,
            base64: Buffer.from("not a real photo".repeat(10)).toString(
              "base64",
            ),
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/places/${id}/signs`,
          payload: photo,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/places/${id}/signs`,
          headers,
          payload: { ...photo, base64: "a".repeat(3 * 1024 * 1024) },
        })
      ).statusCode,
      413,
    );
  } finally {
    await app.close();
  }
});
test("Gemini fallback preserves exact model order, validates JSON and stops on success", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(String(init?.body));
    calls.push(body.model);
    assert.equal(body.store, false);
    assert.ok(init?.signal);
    assert.ok(!String(url).includes("secret"));
    if (calls.length === 1) return new Response("", { status: 503 });
    if (calls.length === 2)
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    if (calls.length === 3) return Response.json({ output_text: "not json" });
    return Response.json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(info) }],
        },
      ],
    });
  };
  const extractor = new SignExtractor({
    geminiKey: "secret",
    fetcher,
  });
  const result = await extractor.extract(
    Buffer.from(photo.base64, "base64"),
    photo.mimeType,
  );
  assert.deepEqual(calls, DEFAULT_GEMINI_MODELS);
  assert.deepEqual(result.info, info);
  await extractor.extract(Buffer.from(photo.base64, "base64"), photo.mimeType);
  assert.equal(calls.length, 5, "failed models are skipped during cooldown");
});

test("exhausted Gemini models fail cleanly without contacting another provider", async () => {
  const calls: string[] = [];
  const extractor = new SignExtractor({ geminiKey: "key", fetcher: async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "generativelanguage.googleapis.com");
    calls.push(JSON.parse(String(init?.body)).model);
    return Response.json({ output_text: JSON.stringify({ ...info, firstHour: -1 }) });
  } });
  await assert.rejects(extractor.extract(new Uint8Array(), "image/png"));
  assert.deepEqual(calls, DEFAULT_GEMINI_MODELS);
  await assert.rejects(extractor.extract(new Uint8Array(), "image/png"));
  assert.equal(calls.length, 4, "cooldown prevents repeated failed requests");
});

test("demo trusts a new contributor immediately; the latest human reports become public", async () => {
  let now = Date.now();
  const store = new ParkingStore(":memory:", catalog, () => now, true);
  const app = await buildApp(catalog, store);
  try {
    const one = store.createSession().token, two = store.createSession().token;
    const proposal = store.propose({ name: "Demo parking", coordinate: points[0], kind: "surface", zoneCode: "B2", note: "" }, one);
    assert.equal(proposal.status, "published");
    assert.equal(proposal.requiredVotes, 1);
    const id = "community:" + proposal.id;
    store.report(id, one, "full"); now++;
    assert.equal(store.report(id, two, "spaces").status, "spaces");
    store.reportPrice(id, one, 60, 60); now++;
    store.reportPrice(id, two, 0, 0);
    assert.equal((await app.inject("/v1/catalog")).json().places[0].communityPrice.firstHour, 0);
    assert.equal((await app.inject("/v1/catalog")).json().trustInputs, true);
    store.confirmLocation(id, two, false);
    assert.equal((await app.inject("/v1/catalog")).json().places.length, 0);
    now++; store.confirmLocation(id, one, true);
    assert.equal((await app.inject("/v1/catalog")).json().places.length, 1);
  } finally { await app.close(); }
});
test("successful Gemini extraction stops fallback and timeouts advance without waiting indefinitely", async () => {
  const calls: string[] = [];
  const extractor = new SignExtractor({
    geminiKey: "key",
    timeoutMs: 20,
    fetcher: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)).model);
      if (calls.length === 1)
        await new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("timeout")),
          );
        });
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(info) }],
          },
        ],
      });
    },
  });
  // Keep node alive while AbortSignal's unreferenced timer fires.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await extractor.extract(new Uint8Array(), "image/png");
    assert.equal(result.model, "gemini-3.7-flash");
    assert.deepEqual(calls, DEFAULT_GEMINI_MODELS.slice(0, 2));
  } finally {
    clearTimeout(keepAlive);
  }
});
test("invalid Gemini key skips its remaining models; missing keys defer durable jobs", async () => {
  const calls: string[] = [];
  const extractor = new SignExtractor({
    geminiKey: "bad",
    fetcher: async (url, init) => {
      calls.push(JSON.parse(String(init?.body)).model);
      return String(url).includes("googleapis")
        ? new Response("", { status: 401 })
        : Response.json({ output_text: JSON.stringify(info) });
    },
  });
  await assert.rejects(extractor.extract(new Uint8Array(), "image/png"));
  await assert.rejects(extractor.extract(new Uint8Array(), "image/png"));
  assert.deepEqual(calls, ["gemini-3.8-flash"]);
  const store = new ParkingStore(":memory:", catalog),
    community = new CommunityStore(store),
    token = store.createSession().token;
  const place = community.contribute(
      { ...contribution, firstHour: null, nextHour: null },
      token,
    ),
    uploaded = community.upload(place.id, token, photo),
    worker = new SignWorker(community, new SignExtractor());
  worker.start();
  await worker.stop();
  assert.equal(community.photo(uploaded.id).status, "waiting");
  assert.equal(community.claim(), undefined);
  community.finish(
    uploaded.id,
    { ...info, confidence: 0.5 },
    "gemini-3.8-flash",
  );
  assert.equal(community.photo(uploaded.id).status, "review");
  assert.equal(community.enrich(store.places())[0].signInfo, undefined);
  community.finish(uploaded.id, info, "gemini-3.8-flash");
  assert.equal(parkingPrice(community.enrich(store.places())[0]), null);
  community.confirmSign(uploaded.id, token, info);
  assert.equal(
    parkingPrice(community.enrich(store.places())[0])?.firstHour,
    40,
  );
  community.finish(
    uploaded.id,
    { ...info, currency: "EUR" },
    "gemini-3.8-flash",
  );
  assert.equal(parkingPrice(community.enrich(store.places())[0])?.firstHour, 40, "late AI cannot overwrite human confirmation");
  community.confirmSign(uploaded.id, token, {...info,currency:"EUR"});
  assert.equal(parkingPrice(community.enrich(store.places())[0]), null);
  store.close();
});


test("parking perimeters support detailed outlines while rejecting excessive vertices", () => {
  const outline = (count: number) => zoneGeometry(Array.from({ length: count }, (_, i) => ({
    latitude: 41.996 + 0.001 * Math.sin(i * Math.PI * 2 / count),
    longitude: 21.432 + 0.001 * Math.cos(i * Math.PI * 2 / count),
  })));
  assert.equal(validZone(outline(119)), true);
  assert.equal(validZone(outline(256)), true);
  assert.equal(validZone(outline(257)), false);
});

test("Macedonian tariff fields survive empty steps and conditional weekend rules", async () => {
  const d8 = { ...info, zoneCode: "D8", currency: "MKD", firstHour: 25, nextHour: 25, maxStayMinutes: null, chargingHours: "Mon–Fri 07:00–23:00; Sat 07:00–23:00", freeWeekends: "sunday", restrictions: "Sunday and public holidays free", rawText: "ЗОНА D8 · цена за 1 час паркирање: 25 ден. · 07ч–23ч · недела и државни празници бесплатно" };
  const extractor = new SignExtractor({ geminiKey: "test", fetcher: async () => Response.json({ status: "completed", steps: [], outputs: [{ type: "text", text: JSON.stringify(d8) }] }) });
  const result = await extractor.extract(new Uint8Array(), "image/png");
  assert.deepEqual(result.info, d8);
});
test("an all-blank parking reading retries the next model instead of showing an empty form", async () => {
  let calls = 0;
  const blank = { ...info, zoneCode: null, firstHour: null, nextHour: null, chargingHours: null, paymentInstructions: null, restrictions: null, rawText: "" };
  const extractor = new SignExtractor({ geminiKey: "test", fetcher: async () => Response.json({ output_text: JSON.stringify(++calls === 1 ? blank : info) }) });
  assert.deepEqual((await extractor.extract(new Uint8Array(), "image/png")).info, info);
  assert.equal(calls, 2);
});
