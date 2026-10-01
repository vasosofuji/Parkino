import test from "node:test";
import assert from "node:assert/strict";
import { createSessionManager } from "../src/services/session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function storage(initial: string | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (next: string) => { value = next; },
    remove: async () => { value = null; },
  };
}

test("a stale 401 or logout cannot remove the token from a newer sign-in", async () => {
  const vault = storage("old-token");
  const manager = createSessionManager(vault, async () => ({ token: "anonymous" }));
  assert.equal(await manager.get(), "old-token");
  await manager.replace("new-token");
  assert.equal(await manager.invalidate("old-token"), false);
  assert.equal(await manager.get(), "new-token");
  assert.equal(await vault.get(), "new-token");
  assert.equal(await manager.invalidate("new-token"), true);
  assert.equal(await vault.get(), null);
});

test("an anonymous session request in flight cannot overwrite a successful login", async () => {
  const response = deferred<{ token: string }>();
  const started = deferred<void>();
  const vault = storage();
  const manager = createSessionManager(vault, () => { started.resolve(); return response.promise; });
  const anonymous = manager.get();
  const rejected = assert.rejects(anonymous, /sign-in changed/);
  await started.promise;
  await manager.replace("recovered-account");
  response.resolve({ token: "abandoned-anonymous" });
  await rejected;
  assert.equal(await manager.get(), "recovered-account");
  assert.equal(await vault.get(), "recovered-account");
});

test("concurrent requests share a single anonymous session creation", async () => {
  let creates = 0;
  const manager = createSessionManager(storage(), async () => { creates++; return { token: "shared-token" }; });
  assert.deepEqual(await Promise.all([manager.get(), manager.get(), manager.get()]), ["shared-token", "shared-token", "shared-token"]);
  assert.equal(creates, 1);
});

test("slow credential storage writes stay ordered when accounts switch", async () => {
  const writeStarted = deferred<void>();
  const releaseWrite = deferred<void>();
  const vault = storage();
  const manager = createSessionManager({
    ...vault,
    set: async (token) => {
      if (token === "older-login") { writeStarted.resolve(); await releaseWrite.promise; }
      await vault.set(token);
    },
  }, async () => ({ token: "anonymous" }));
  const older = manager.replace("older-login");
  const rejected = assert.rejects(older, /sign-in changed/);
  await writeStarted.promise;
  const newer = manager.replace("newer-login");
  releaseWrite.resolve();
  await Promise.all([rejected, newer]);
  assert.equal(await manager.get(), "newer-login");
  assert.equal(await vault.get(), "newer-login");
});

test("an invalidation already waiting on storage cannot cancel a newer login", async () => {
  const reading = deferred<void>();
  const release = deferred<void>();
  const vault = storage("old-token");
  let first = true;
  const manager = createSessionManager({ ...vault, get: async () => {
    if (first) { first = false; reading.resolve(); await release.promise; }
    return vault.get();
  } }, async () => ({ token: "anonymous" }));
  const invalidation = manager.invalidate("old-token");
  await reading.promise;
  const login = manager.replace("new-token");
  release.resolve();
  assert.equal(await invalidation, false);
  await login;
  assert.equal(await vault.get(), "new-token");
});

test("a delayed authentication response cannot undo an explicit sign-out", async () => {
  const vault = storage("current-token");
  const manager = createSessionManager(vault, async () => ({ token: "anonymous" }));
  const loginVersion = manager.generation();
  await manager.invalidate("current-token");
  await assert.rejects(manager.replace("late-response", loginVersion), /sign-in changed/);
  assert.equal(await vault.get(), null);
});
