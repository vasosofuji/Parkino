import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { ParkingPlace } from "../src/domain/types";
const provenance = z.object({
  label: z.string().min(3),
  url: z.url(),
  retrievedAt: z.iso.datetime(),
});
const rate = z.object({
  firstHour: z.number().nonnegative(),
  nextHour: z.number().nonnegative(),
  maxStayMinutes: z.number().int().positive().nullable(),
  source: provenance,
});
const schema = z.object({
  schemaVersion: z.literal(1),
  operator: z.enum(["gradski", "poc", "adsdp", "private"]),
  places: z.array(
    z.object({
      externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
      name: z.string().min(3).max(150),
      nameEn: z.string().optional(),
      coordinate: z.object({
        latitude: z.number().min(41.91).max(42.08),
        longitude: z.number().min(21.3).max(21.58),
      }),
      kind: z.enum(["surface", "garage", "underground", "street", "zone"]),
      zoneCode: z.string().nullable(),
      access: z.enum(["public", "customers", "restricted", "unknown"]),
      tariff: rate.nullable(),
      capacity: z.number().int().nonnegative().nullable(),
      openingHours: z.string().nullable(),
      source: provenance,
    }),
  ),
});
const path = process.argv[2];
if (!path)
  throw new Error("Usage: npm run import:operator -- path/to/operator.json");
const document = schema.parse(JSON.parse(readFileSync(resolve(path), "utf8")));
const ids = new Set<string>();
const places: ParkingPlace[] = document.places.map((place) => {
  const id = `operator:${document.operator}:${place.externalId}`;
  if (ids.has(id)) throw new Error("Duplicate operator facility id: " + id);
  ids.add(id);
  const { externalId, tariff, ...rest } = place;
  return {
    ...rest,
    id,
    operator: document.operator,
    verification: "official",
    tariff: tariff ? { ...tariff, evidence: "official" } : null,
  };
});
mkdirSync(resolve("data/partners"), { recursive: true });
const target = resolve("data/partners", document.operator + ".json"),
  temporary = target + ".tmp";
writeFileSync(temporary, JSON.stringify(places, null, 2) + "\n");
renameSync(temporary, target);
console.log(
  `Validated ${places.length} operator facilities. Restart the API to load them.`,
);
