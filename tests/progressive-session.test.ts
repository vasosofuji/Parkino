import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { apiEndpoint } from "../src/services/apiEndpoint";
import { createProgressiveEntry, type EntryApi } from "../src/domain/progressive-entry";
import type { ParkingPlace } from "../src/domain/types";
const source = ts.transpileModule(readFileSync("src/services/api.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function apiHarness(send: (path: string, init: RequestInit) => Promise<unknown>) {
  let generation = 0;
  const session = { generation: () => generation, get: async () => generation ? "new-account-token" : "original-account-token", invalidate: async () => {} };
  const scope = {
    exports: {} as { api: { progressiveWriter: () => Promise<EntryApi> } }, process: { env: { EXPO_PUBLIC_API_URL: "https://api.example.test" } },
    require(name: string) {
      if (name === "react-native") return { Platform: { OS: "android" } };
      if (name === "expo-constants") return { __esModule: true, default: { expoConfig: {} } };
      if (name === "./transport") return { createTransport: () => send };
      if (name === "./credentials") return { credentials: {} };
      if (name === "./session") return { createSessionManager: () => session };
      if (name === "./apiEndpoint") return { apiEndpoint };
      if (name === "../domain/account") return { TERMS_VERSION: "test" };
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(source, scope);
  return { writer: () => scope.exports.api.progressiveWriter(), changeAccount: () => { generation++; } };
}
test("an old progressive writer cannot send under a newly signed-in account", async () => {
  let requests = 0;
  const scope = apiHarness(async () => { requests++; });
  const writer = await scope.writer();
  scope.changeAccount();
  await assert.rejects(writer.price("park", 20, 20), /sign-in changed/);
  assert.equal(requests, 0);
});
test("switching accounts during capacity save cannot send its queued free-space report", async () => {
  let release!: () => void;
  const calls: { path: string; token: string }[] = [];
  const scope = apiHarness(async (path, init) => { calls.push({ path, token: (init.headers as Record<string, string>).Authorization }); await new Promise<void>(resolve => { release = resolve; }); });
  const client = await scope.writer();
  const writer = createProgressiveEntry(client, { place: { id: "park", capacity: null, zoneCode: null } as ParkingPlace });
  const saving = writer.spaces(20, 5);
  await new Promise(resolve => setImmediate(resolve));
  scope.changeAccount(); release();
  await assert.rejects(saving, /sign-in changed/);
  assert.deepEqual(calls, [{ path: "/v1/places/park/capacity", token: "Bearer original-account-token" }]);
  assert.equal(writer.snapshot().total, 20, "the completed write remains recorded under the original draft");
});
