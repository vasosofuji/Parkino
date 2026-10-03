import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog } from "../src/domain/types";
import { ParkingStore } from "./store";
import { buildApp } from "./app";
import { configuredExtractor } from "./sign-ai";
import { PgDatabase } from "./postgres/database";
import { PostgresParkingStore } from "./postgres/store";

export async function createApp(backgroundTask?: (task: Promise<void>) => void) {
  if ((backgroundTask || process.env.NODE_ENV === "production") && !process.env.DATABASE_URL)
    throw new Error("Production API requires DATABASE_URL; refusing temporary local storage.");
  const catalog: Catalog = JSON.parse(readFileSync(resolve("data/catalog.json"), "utf8"));
  if (existsSync(resolve("data/partners"))) {
    for (const name of readdirSync(resolve("data/partners")).filter(name => name.endsWith(".json")))
      catalog.places.push(...JSON.parse(readFileSync(resolve("data/partners", name), "utf8")));
  }
  let store: ParkingStore | PostgresParkingStore;
  if (process.env.DATABASE_URL) {
    const database = new PgDatabase(process.env.DATABASE_URL);
    try {
      await database.prepare("SELECT 1 FROM profiles LIMIT 1").all();
      if (backgroundTask) await database.prepare("SELECT 1 FROM request_limits LIMIT 1").all();
      store = new PostgresParkingStore(database, Date.now, process.env.DEMO_TRUST_INPUTS !== "false");
      await store.seed(catalog);
    } catch (error) {
      await database.close();
      throw error;
    }
  } else {
    mkdirSync(resolve("data/runtime"), { recursive: true });
    store = new ParkingStore(resolve(process.env.DATABASE_PATH ?? "data/runtime/parking.sqlite"),
      catalog, Date.now, process.env.DEMO_TRUST_INPUTS !== "false");
  }
  try {
    return await buildApp(catalog, store, {
      adminKey: process.env.ADMIN_API_KEY,
      feedKeys: process.env.OPERATOR_FEED_KEYS ? JSON.parse(process.env.OPERATOR_FEED_KEYS) : {},
      origins: process.env.ALLOWED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean),
      signExtractor: configuredExtractor(),
      requireOnboarding: true,
      // Vercel overwrites forwarded client IPs; trust its immediate ingress hop.
      trustedProxies: backgroundTask ? (_address, hop) => hop === 0 :
        process.env.TRUSTED_PROXIES?.split(",").map(value => value.trim()).filter(Boolean),
      backgroundTask,
      cronSecret: process.env.CRON_SECRET,
    });
  } catch (error) {
    await store.close();
    throw error;
  }
}
