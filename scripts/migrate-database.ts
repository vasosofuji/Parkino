import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PgDatabase } from "../server/postgres/database";

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set the server-only DATABASE_URL in .env first.");
  const db = new PgDatabase(process.env.DATABASE_URL);
  try {
    await db.exec("CREATE SCHEMA IF NOT EXISTS parkskopje");
    await db.exec(
      "CREATE TABLE IF NOT EXISTS parkskopje.schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    for (const name of readdirSync(resolve("supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await db.transaction(async () => {
        await db.exec("SELECT pg_advisory_xact_lock(17352614)");
        if (
          await db
            .prepare("SELECT name FROM schema_migrations WHERE name=?")
            .get(name)
        )
          return;
        await db.exec(
          readFileSync(resolve("supabase/migrations", name), "utf8"),
        );
        await db
          .prepare("INSERT INTO schema_migrations(name) VALUES (?)")
          .run(name);
        console.log("Applied " + name);
      });
    }
    console.log("Parking database is ready.");
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
