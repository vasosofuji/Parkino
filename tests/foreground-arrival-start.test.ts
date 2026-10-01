import test from "node:test";
import assert from "node:assert/strict";
import { startArrivalInForeground } from "../src/services/foregroundArrivalStart";

test("Home after permissions leaves start pending without waiting for another AppState event", async () => {
  let starts = 0;
  assert.equal(await startArrivalInForeground({ active: () => false, allowed: () => true, running: async () => false, start: async () => { starts++; } }), "pending");
  assert.equal(starts, 0);
});

test("foreground state and opt-in are checked again after the native running-status lookup", async () => {
  for (const cancelled of [false, true]) {
    let active = true, allowed = true, starts = 0;
    const result = await startArrivalInForeground({
      active: () => active, allowed: () => allowed,
      running: async () => { if (cancelled) allowed = false; else active = false; return false; },
      start: async () => { starts++; },
    });
    assert.equal(result, cancelled ? "cancelled" : "pending");
    assert.equal(starts, 0);
  }
});

test("native Android rejection before the JS AppState event is a deferral, and the next activation starts", async () => {
  let attempts = 0;
  const operations = {
    active: () => true, allowed: () => true, running: async () => false,
    start: async () => { if (++attempts === 1) throw new Error("Couldn't start foreground service. Application is in background"); },
  };
  assert.equal(await startArrivalInForeground(operations), "pending");
  assert.equal(await startArrivalInForeground(operations), "started");
  assert.equal(attempts, 2);
});

test("logout invalidates an outstanding native start; unrelated failures receive a readable error", async () => {
  let allowed = true;
  assert.equal(await startArrivalInForeground({
    active: () => true, allowed: () => allowed, running: async () => false,
    start: async () => { allowed = false; throw new Error("native interruption"); },
  }), "cancelled");
  await assert.rejects(startArrivalInForeground({
    active: () => true, allowed: () => true, running: async () => false,
    start: async () => { throw new Error("E_LOCATION_UNKNOWN native stack detail"); },
  }), { message: "Parking reminders could not start. Check location permissions and try again." });
});
