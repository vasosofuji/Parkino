import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { PgDatabase } from "../server/postgres/database";

// One-time import into an empty Supabase database, with the API stopped.
// Preserve token hashes so existing installations keep their usernames.
const tables = [
  "places",
  "sessions",
  "proposals",
  "reports",
  "votes",
  "price_reports",
  "location_reports",
  "observations",
  "contributions",
  "labels",
  "boundaries",
  "sign_photos",
  "profiles",
];
async function main() {
  const mergeCatalog = process.argv.includes("--merge-catalog");
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL first, then run db:migrate.");
  const source = new DatabaseSync(
    resolve(process.env.DATABASE_PATH ?? "data/runtime/parking.sqlite"),
    { readOnly: true },
  );
  const destination = new PgDatabase(process.env.DATABASE_URL);
  try {
    const sourceTables = new Set(
      (
        source
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[]
      ).map((row) => row.name),
    );
    await destination.transaction(async () => {
      for (const table of tables) {
        if (mergeCatalog && table === "places") continue;
        if (
          (
            (await destination
              .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
              .get()) as { n: number }
          ).n
        )
          throw new Error(
            "Destination is not empty. Import cancelled without changing any data.",
          );
      }
      for (const table of tables) {
        if (!sourceTables.has(table)) continue;
        const rows = source.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const columns = Object.keys(row);
          await destination
            .prepare(
              `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})${mergeCatalog && table === "places" ? " ON CONFLICT (id) DO NOTHING" : ""}`,
            )
            .run(
              ...Object.values(row).map((value) =>
                value instanceof Uint8Array ? Buffer.from(value) : value,
              ),
            );
        }
        console.log(`Copied ${rows.length} ${table} rows`);
      }
    });
    console.log("Import committed. Original SQLite database is unchanged.");
  } finally {
    source.close();
    await destination.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
