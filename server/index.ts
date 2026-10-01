import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog } from "../src/domain/types";
import { ParkingStore } from "./store";
import { buildApp } from "./app";
import { configuredExtractor } from "./sign-ai";
import { PgDatabase } from "./postgres/database";
import { PostgresParkingStore } from "./postgres/store";
async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("Production API requires DATABASE_URL; refusing temporary local storage.");
  const catalog: Catalog = JSON.parse(
    readFileSync(resolve("data/catalog.json"), "utf8"),
  );
  if (existsSync(resolve("data/partners"))) {
    for (const name of readdirSync(resolve("data/partners")).filter((name) =>
      name.endsWith(".json"),
    )) {
      catalog.places.push(
        ...JSON.parse(readFileSync(resolve("data/partners", name), "utf8")),
      );
    }
  }
  mkdirSync(resolve("data/runtime"), { recursive: true });
  let store: ParkingStore | PostgresParkingStore;
  if (process.env.DATABASE_URL) {
    const database = new PgDatabase(process.env.DATABASE_URL);
    // Apply the checked-in migration explicitly before connecting the server.
    await database.prepare("SELECT 1 FROM profiles LIMIT 1").all();
    store = new PostgresParkingStore(
      database,
      Date.now,
      process.env.DEMO_TRUST_INPUTS !== "false",
    );
    await store.seed(catalog);
  } else
    store = new ParkingStore(
      resolve(process.env.DATABASE_PATH ?? "data/runtime/parking.sqlite"),
      catalog,
      Date.now,
      process.env.DEMO_TRUST_INPUTS !== "false",
    );
  const feedKeys = process.env.OPERATOR_FEED_KEYS
    ? (JSON.parse(process.env.OPERATOR_FEED_KEYS) as Record<string, string>)
    : {};
  const app = await buildApp(catalog, store, {
    adminKey: process.env.ADMIN_API_KEY,
    feedKeys,
    origins: process.env.ALLOWED_ORIGINS?.split(","),
    signExtractor: configuredExtractor(),
    requireOnboarding: true,
    trustedProxies: process.env.TRUSTED_PROXIES?.split(",").map(value => value.trim()).filter(Boolean),
  });
  await app.listen({
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "127.0.0.1",
  });
  console.log(
    `ParkSkopje API listening at http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? "3001"}`,
  );
  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
