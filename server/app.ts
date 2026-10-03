import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Catalog, Destination } from "../src/domain/types";
import { ParkingStore } from "./store";
import { CommunityStore } from "./community";
import { SignWorker, signSchema, type SignExtractor } from "./sign-ai";
import { registerAccountRoutes } from "./account-routes";
import { accountError, bearerToken, RequestBudget } from "./account-security";
import { validZone, MAX_BOUNDARY_VERTICES } from "../src/domain/geometry";
import { AccountStore } from "./accounts";
import { TERMS_VERSION } from "../src/domain/account";
import { PostgresParkingStore } from "./postgres/store";
import { PostgresCommunityStore } from "./postgres/community";
import { PostgresAccountStore } from "./postgres/accounts";
import { SharedRequestBudget, sharedRateLimitStore } from "./postgres/rate-limits";
import { usernameKey } from "../src/domain/account";
const coordinate = z.object({
  latitude: z.number().min(41.91).max(42.08),
  longitude: z.number().min(21.3).max(21.58),
});
const proposalSchema = z.object({
  name: z.string().trim().min(3).max(100),
  coordinate,
  kind: z.enum(["surface", "garage", "underground", "street"]),
  zoneCode: z.string().trim().max(16).nullable(),
  note: z.string().trim().min(5).max(500),
});
const observationSchema = z.object({
  observations: z
    .array(
      z.object({
        placeId: z.string().max(100),
        freeSpaces: z.number().int().nonnegative(),
        observedAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(500),
});
function secretMatches(provided: string, expected: string | undefined) {
  if (!expected) return false;
  const a = Buffer.from(provided),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function buildApp(
  catalog: Catalog,
  store: ParkingStore | PostgresParkingStore,
  options: {
    adminKey?: string;
    feedKeys?: Record<string, string>;
    origins?: string[];
    signExtractor?: SignExtractor;
    requireOnboarding?: boolean;
    trustedProxies?: string[] | ((address: string, hop: number) => boolean);
    backgroundTask?: (task: Promise<void>) => void;
    cronSecret?: string;
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, requestTimeout: 15000, connectionTimeout: 15000, trustProxy: options.trustedProxies ?? false });
  const community =
    store instanceof PostgresParkingStore
      ? new PostgresCommunityStore(store)
      : new CommunityStore(store);
  const accounts =
    store instanceof PostgresParkingStore
      ? new PostgresAccountStore(store)
      : new AccountStore(store);
  const worker = options.signExtractor
    ? new SignWorker(community, options.signExtractor)
    : undefined;
  await app.register(cors, {
    origin: options.origins ?? [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ],
    allowedHeaders: ["Content-Type", "Authorization", "X-Operator-Key"],
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
  });
  const sharedBudget = options.backgroundTask && store instanceof PostgresParkingStore
    ? new SharedRequestBudget(store.db) : undefined;
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute",
    ...(sharedBudget ? { store: sharedRateLimitStore(sharedBudget) } : {}) });
  const requestBudget = sharedBudget ?? new RequestBudget();
  app.addHook("onRequest", async (request, reply) => {
    // These aggregate limits still apply when a route has a custom IP limit.
    await requestBudget.consume("process", "all", 3000, 60000);
    await requestBudget.consume("ip", request.ip, 300, 60000);
    reply.header("X-Content-Type-Options", "nosniff");
    if (request.headers.authorization || request.url.startsWith("/v1/auth/") || request.url === "/v1/sessions")
      reply.header("Cache-Control", "no-store");
  });
  registerAccountRoutes(app, accounts, sharedBudget ? {
    consume: (username: string) => sharedBudget.consume("login", usernameKey(username), 8, 15 * 60000),
  } : undefined);
  app.addHook("preHandler", async (request) => {
    if (!["POST", "PUT"].includes(request.method))
      return;
    const url = request.url.split("?")[0];
    if (
      url === "/v1/sessions" ||
      url === "/v1/profile" ||
      url === "/v1/auth/login" ||
      url === "/v1/auth/guest" ||
      url === "/v1/auth/logout" ||
      url.startsWith("/v1/operators/")
    )
      return;
    const auth = token(request.headers.authorization);
    const user = await store.session(auth);
    await requestBudget.consume("writes", user.id, 60, 60000);
    const route = request.routeOptions.url;
    if (route === "/v1/places/:id/signs") {
      await requestBudget.consume("uploads-hour", user.id, 10, 3600000);
      await requestBudget.consume("uploads-day", user.id, 30, 86400000);
    } else if (route === "/v1/contributions") await requestBudget.consume("contributions", user.id, 20, 3600000);
    if (options.requireOnboarding) {
      const profile = await accounts.profile(auth);
      if (!profile || profile.termsVersion !== TERMS_VERSION)
        throw accountError("Accept the current Terms of Service first.", 403);
    }
  });
  app.get("/v1/profile", async (request) =>
    accounts.profile(token(request.headers.authorization)),
  );
  app.get("/v1/usernames/availability", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const { username } = z
      .object({ username: z.string().max(100) })
      .parse(request.query);
    return { available: await accounts.available(username) };
  });
  app.post(
    "/v1/profile",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (request) => {
      const input = z
        .object({
          username: z.string().max(100),
          accepted: z.literal(true),
          termsVersion: z.literal(TERMS_VERSION),
          password: z.string().min(10).max(128),
        })
        .strict()
        .parse(request.body);
      return accounts.register(
        token(request.headers.authorization),
        input.username,
        input.termsVersion,
        input.accepted,
        input.password,
      );
    },
  );
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: "Invalid request.",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    const e = error as Error & { statusCode?: number };
    reply.code(e.statusCode ?? 500).send({
      error:
        e.statusCode && e.statusCode < 500
          ? e.message
          : "Server error. Please try again.",
    });
  });
  const token = bearerToken;
  app.get("/health", { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await store.db.prepare("SELECT 1 FROM places LIMIT 1").get();
      return { status: "ok", schemaVersion: 1 };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  const searchCache = new Map<string, { at: number; results: Destination[] }>();
  let nextSearch = 0;
  app.get("/v1/search", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
    const { q } = z
      .object({ q: z.string().trim().min(3).max(160) })
      .parse(request.query);
    const cached = searchCache.get(q.toLowerCase());
    if (cached && Date.now() - cached.at < 86400000) return cached.results;
    if (Date.now() < nextSearch)
      throw Object.assign(
        new Error("Please try searching again in a moment."),
        { statusCode: 429 },
      );
    nextSearch = Date.now() + 1100;
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      countrycodes: "mk",
      viewbox: "21.30,42.08,21.58,41.91",
      bounded: "1",
      limit: "6",
    });
    const response = await fetch(
      `${process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search"}?${params}`,
      {
        headers: { "User-Agent": "ParkSkopje/1.0 destination-search" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok)
      throw Object.assign(
        new Error("Address search is unavailable. Choose a point on the map."),
        { statusCode: 503 },
      );
    const data = z
      .array(
        z.object({
          place_id: z.number(),
          display_name: z.string(),
          lat: z.string(),
          lon: z.string(),
        }),
      )
      .parse(await response.json());
    const results = data
      .map((d) => ({
        id: `search:${d.place_id}`,
        name: d.display_name,
        coordinate: { latitude: Number(d.lat), longitude: Number(d.lon) },
      }))
      .filter((d) => coordinate.safeParse(d.coordinate).success);
    if (searchCache.size >= 500)
      searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(q.toLowerCase(), { at: Date.now(), results });
    return results;
  });
  app.get("/v1/catalog", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async () => {
    await store.publishReadyProposals();
    return {
      ...catalog,
      trustInputs: store.trustInputs,
      places: await community.enrich(await store.places()),
    };
  });
  const geometry = z
    .object({
      type: z.literal("Polygon"),
      coordinates: z
        .array(
          z
            .array(
              z.tuple([
                z.number().min(21.3).max(21.58),
                z.number().min(41.91).max(42.08),
              ]),
            )
            .min(4)
            .max(MAX_BOUNDARY_VERTICES + 1),
        )
        .length(1),
    })
    .refine(validZone, "Draw a closed perimeter without crossing edges.");
  app.post(
    "/v1/contributions",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const input = z
        .object({
          requestId: z.string().min(8).max(80),
          name: z.string().trim().min(3).max(100),
          coordinate,
          kind: z.enum(["surface", "garage", "underground", "street", "zone"]),
          geometry: geometry.optional(),
          zoneCode: z.string().trim().max(16).nullable(),
          firstHour: z.number().min(0).max(10000).nullable(),
          nextHour: z.number().min(0).max(10000).nullable(),
          capacity: z.number().int().min(0).max(100000).nullable().optional(),
          freeSpaces: z.number().int().min(0).max(100000).nullable().optional(),
        })
        .refine(v => v.capacity == null || v.freeSpaces == null || v.freeSpaces <= v.capacity, "Free spaces cannot exceed capacity.")
        .refine(v => v.kind !== "zone" || v.freeSpaces == null, "Report free spaces for an individual parking area.")
        .refine(
          (v) => v.kind !== "zone" || Boolean(v.geometry),
          "Draw the zone boundary first.",
        )
        .parse(request.body);
      const auth = token(request.headers.authorization);
      const place = await community.contribute(input, auth);
      // Reward only the original contribution, never a retry's body or later work by other drivers.
      const rewards = await community.contributionRewards(place.id, auth);
      await accounts.award(auth, `parking:${place.id}`, "parking");
      for (const kind of rewards.kinds) await accounts.award(auth,
        `${kind}:${place.id}${kind === "availability" ? ":" + new Date(rewards.created).toISOString().slice(0,10) : ""}`, kind);
      return reply.code(201).send(place);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/places/:id/labels",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const { zoneCode } = z
        .object({
          zoneCode: z
            .string()
            .trim()
            .min(1)
            .max(16)
            .regex(/^[\p{L}\p{N} -]+$/u),
        })
        .parse(request.body);
      return community.label(
        request.params.id,
        token(request.headers.authorization),
        zoneCode,
      );
    },
  );
  app.put<{ Params: { id: string } }>(
    "/v1/places/:id/boundary",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const result = await community.boundary(
        request.params.id,
        token(request.headers.authorization),
        geometry.parse(request.body),
      );
      await accounts.award(token(request.headers.authorization), `boundary:${request.params.id}`, "boundary");
      return result;
    },
  );
  app.get<{ Params: { id: string } }>("/v1/places/:id/signs", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) =>
    community.photos(request.params.id, token(request.headers.authorization) || undefined),
  );
  app.put<{Params:{id:string}}>("/v1/places/:id/payment-schedule", {config:{rateLimit:{max:20,timeWindow:"1 minute"}}}, async request => {
    const value = z.object({ chargingHours: z.string().trim().max(500).nullable(), freeWeekends: z.enum(["both", "sunday", "neither"]).nullable() }).strict().parse(request.body);
    return community.paymentSchedule(request.params.id, token(request.headers.authorization), value);
  });
  app.put<{Params:{id:string}}>("/v1/places/:id/capacity", {config:{rateLimit:{max:20,timeWindow:"1 minute"}}}, async request => {
    const {capacity} = z.object({capacity:z.number().int().min(0).max(100000)}).parse(request.body);
    const auth = token(request.headers.authorization);
    const result = await community.capacity(request.params.id, auth, capacity);
    await accounts.award(auth, `capacity:${request.params.id}`, "capacity");
    return result;
  });
  app.post<{ Params: { id: string } }>("/v1/signs/:id/confirm", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async request => {
    const auth = token(request.headers.authorization);
    const details = signSchema.refine(info => Boolean(info.zoneCode?.trim() || info.firstHour !== null || info.nextHour !== null ||
      info.freeWeekends || info.chargingHours?.trim() || info.paymentInstructions?.trim() || info.restrictions?.trim() || info.rawText.trim().length >= 3),
    "Add at least one detail from the sign.").parse(request.body);
    const photo = await community.confirmSign(request.params.id, auth, details);
    await accounts.award(auth, `sign:${photo.placeId}`, "sign");
    return photo;
  });
  app.post<{ Params: { id: string } }>(
    "/v1/places/:id/signs",
    {
      bodyLimit: 3 * 1024 * 1024,
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const input = z
        .object({
          base64: z.string().min(40).max(2800000),
          mimeType: z.enum(["image/jpeg", "image/png"]),
        })
        .parse(request.body);
      const result = await community.upload(
        request.params.id,
        token(request.headers.authorization),
        input,
      );
      if (!options.backgroundTask) worker?.wake();
      return reply.code(201).send(result);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/v1/signs/:id/image",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const image = await community.image(request.params.id);
      return reply
        .type(image.mime)
        .header("Cache-Control", "public, max-age=3600")
        .header("X-Content-Type-Options", "nosniff")
        .header("ETag", `"${image.hash}"`)
        .send(Buffer.from(image.bytes));
    },
  );
  app.get("/v1/proposals", async () => {
    await store.publishReadyProposals();
    return store.proposals();
  });
  app.post(
    "/v1/sessions",
    { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (_request, reply) =>
      reply.code(201).send(await store.createSession()),
  );
  app.delete("/v1/sessions/me", async (request) => {
    await store.deleteSession(token(request.headers.authorization));
    return { deleted: true };
  });
  app.post<{ Params: { id: string } }>(
    "/v1/places/:id/prices",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const body = z
        .object({
          firstHour: z.number().min(0).max(10000),
          nextHour: z.number().min(0).max(10000),
        })
        .parse(request.body);
      const result = await store.reportPrice(
        request.params.id,
        token(request.headers.authorization),
        body.firstHour,
        body.nextHour,
      );
      await accounts.award(token(request.headers.authorization), `pricing:${request.params.id}`, "pricing");
      return result;
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/places/:id/confirmations",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const body = z.object({ present: z.boolean() }).parse(request.body);
      return store.confirmLocation(
        request.params.id,
        token(request.headers.authorization),
        body.present,
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/places/:id/reports",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const body = z
        .object({ status: z.enum(["spaces", "full"]), freeSpaces: z.number().int().min(0).max(100000).optional() })
        .parse(request.body);
      const result = await store.report(
        request.params.id,
        token(request.headers.authorization),
        body.status,
        body.freeSpaces,
      );
      await accounts.award(token(request.headers.authorization), `availability:${request.params.id}:${new Date().toISOString().slice(0,10)}`, "availability");
      return result;
    },
  );
  app.post(
    "/v1/proposals",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await store.propose(
            proposalSchema.parse(request.body),
            token(request.headers.authorization),
          ),
        ),
  );
  app.post<{ Params: { id: string } }>(
    "/v1/proposals/:id/votes",
    async (request) =>
      store.vote(request.params.id, token(request.headers.authorization)),
  );
  app.post<{ Params: { operator: string } }>(
    "/v1/operators/:operator/observations",
    async (request) => {
      const key = request.headers["x-operator-key"];
      if (
        !secretMatches(
          typeof key === "string" ? key : "",
          options.feedKeys?.[request.params.operator],
        )
      )
        throw Object.assign(new Error("Invalid operator credentials."), {
          statusCode: 401,
        });
      return store.observe(
        request.params.operator,
        observationSchema.parse(request.body).observations,
      );
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/v1/admin/proposals/:id",
    async (request) => {
      if (
        !secretMatches(token(request.headers.authorization), options.adminKey)
      )
        throw Object.assign(new Error("Admin credentials required."), {
          statusCode: 401,
        });
      return store.moderate(request.params.id);
    },
  );
  if (options.backgroundTask) {
    // A function can suspend immediately after responding. Register the job
    // promise with its request lifecycle instead of relying on resident timers.
    app.addHook("onResponse", async () => {
      if (worker) options.backgroundTask!(worker.wake(2));
    });
    app.get("/internal/sign-jobs", async (request, reply) => {
      if (!secretMatches(token(request.headers.authorization), options.cronSecret))
        return reply.code(401).send({ error: "Worker credentials required." });
      await sharedBudget?.prune();
      await worker?.wake(2);
      return { status: "ok" };
    });
  } else app.addHook("onReady", async () => worker?.start());
  app.addHook("onClose", async () => {
    await worker?.stop();
    await store.close();
  });
  return app;
}
