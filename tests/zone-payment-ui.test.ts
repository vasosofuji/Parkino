import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isVerifiedSmsPayment } from "../src/domain/sms-payment";
import { parkingPrice } from "../src/domain/parking";
import { paymentZone, verified } from "./fixtures/zone-payment";
import type { ParkingPlace } from "../src/domain/types";

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const nodes = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "children" in value ? [value as Element, ...(value as Element).children.flatMap(nodes)] : [];
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(stop = false) {
  const state: any[] = [], effects: (() => void)[] = [], layout: (() => void)[] = [], calls: { recipient: string; body: string; guard: () => boolean }[] = [], stored: unknown[] = [];
  let cursor = 0, valid = true, closed = 0, result = "opened", place: ParkingPlace | null = paymentZone;
  let account = { accountId: "account", ready: true, savedPlate: "SK1234FF", pendingStop: { zoneId: "zone", zoneName: "Zone D8", recipient: "144144", stopMessage: "S", photoId: "photo", protocolExpiresAt: verified.expiresAt, openedAt: 0, plate: "SK1234FF" }, setPendingStop: async (value: unknown) => { stored.push(value); }, clearPendingStop: async () => { stored.push("cleared"); } };
  const requests: ((value: { place: ParkingPlace; protocol: typeof verified }) => void)[] = [];
  const effect = (queue: (() => void)[], fn: () => void, deps?: unknown[]) => { const index = cursor++, previous = state[index]; if (!previous || !deps || deps.some((value, i) => value !== previous.deps[i])) queue.push(() => { previous?.cleanup?.(); state[index] = { deps, cleanup: fn() }; }); };
  const react = { Fragment: "Fragment", createElement: (type: string, props: Record<string, any>, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }), useRef(value: unknown) { const index = cursor++; return state[index] ?? (state[index] = { current: value }); }, useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], (value: unknown) => { state[index] = value; }]; }, useEffect: (fn: () => void, deps?: unknown[]) => effect(effects, fn, deps), useLayoutEffect: (fn: () => void, deps?: unknown[]) => effect(layout, fn, deps) };
  const context = { exports: {} as { default: (props: any) => Element; ParkingSmsStopSheet: (props: any) => Element }, Date: class extends Date { static now() { return Date.parse("2026-10-05T10:00:00Z"); } }, require(name: string) {
    if (name === "react") return { ...react, default: react, __esModule: true };
    if (name === "react-native") return { AppState: { currentState: "active" }, Image: "Image", Text: "Text", View: "View" };
    if (name === "../state/LicensePlateContext") return { useLicensePlate: () => account };
    if (name === "../state/ParkingContext") return { useParking: () => ({ t: (en: string) => en }) };
    if (name === "../state/ThemeContext") return { useTheme: () => ({ colors: { ink: "black", green: "green" } }) };
    if (name === "./ui") return { Sheet: "Sheet", Button: "Button", Note: "Note" };
    if (name === "../domain/sms-payment") return { isVerifiedSmsPayment: (value: typeof verified) => isVerifiedSmsPayment(value, Date.parse("2026-10-05T10:00:00Z")) };
    if (name === "../domain/parking") return { parkingPrice };
    if (name === "../services/api") return { api: { catalog: async () => ({ places: place ? [place] : [] }), smsPayment: () => new Promise(resolve => requests.push(resolve)), imageUrl: (id: string) => `photo:${id}` } };
    if (name === "../services/smsComposer") return { openSmsComposer: async (recipient: string, body: string, guard: () => boolean) => { calls.push({ recipient, body, guard }); return guard() ? result : "cancelled"; } };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/components/ZonePaymentSheet.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  const validate = () => valid ? place : null, onClose = () => { closed++; valid = false; };
  const render = () => { cursor = 0; const tree = stop ? context.exports.ParkingSmsStopSheet({ visible: true, onClose }) : context.exports.default({ place, validate, onClose }); layout.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); return tree; };
  return { render, calls, stored, requests, closed: () => closed, hide: () => { place = null; }, invalidate: () => { valid = false; }, changePlate: () => { account = { ...account, savedPlate: "SK9999FF" }; }, protocol: (next: typeof verified) => { place = { ...paymentZone, smsPayment: next }; }, respond: async (protocol = place!.smsPayment!) => { requests.shift()!({ place: place!, protocol }); await flush(); }, unsupported: () => { result = "unsupported"; } };
}

test("the actual initial map render without a payment place stays hidden and never reads null choice/proof", () => {
  const view = harness(); view.hide(); const tree = view.render();
  assert.equal(tree.props.visible, false); assert.equal(tree.props.footer.props.disabled, true);
  assert.equal(view.requests.length, 0); assert.equal(view.calls.length, 0);
});

test("payment exposes no recipient/message until fresh proof, then opens only the displayed SMS and retains stop draft", async () => {
  const view = harness(); let tree = view.render();
  assert.equal(nodes(tree).some(node => node.type === "Image"), false);
  assert.equal(tree.props.footer.props.disabled, true);
  await view.respond(); tree = view.render();
  assert.equal(tree.props.footer.props.disabled, false);
  assert.ok(nodes(tree).some(node => node.type === "Image" && node.props.source.uri === "photo:photo"));
  tree.props.footer.props.onPress(); await view.respond(); tree = view.render();
  assert.equal(view.calls.length, 1); assert.equal(view.calls[0].recipient, "144144"); assert.equal(view.calls[0].body, "D8 SK1234FF");
  assert.equal((view.stored[0] as any).stopMessage, "S"); assert.equal(view.closed(), 1);
});

test("stale leave/close before fresh send validation cannot open SMS", async () => {
  const view = harness(); view.render(); await view.respond(); const tree = view.render();
  tree.props.footer.props.onPress(); view.invalidate(); await view.respond();
  assert.equal(view.calls.length, 0); assert.equal(view.stored.length, 0);
});

test("fixed-hours choices are explicit and do not carry across a changed protocol", async () => {
  const fixed = { ...verified, mode: "fixed-hours" as const, startTemplate: "{zone} {plate} {hours}", stopTemplate: null, allowedHours: [1, 2], evidence: { ...verified.evidence, sampleHours: 1, startExample: "D8 SK1234FF 1", stopExample: null, stopInstructionText: null, durationText: "1, 2 hours" } };
  const view = harness(); view.protocol(fixed); view.render(); await view.respond(fixed); let tree = view.render();
  assert.equal(tree.props.footer.props.disabled, true);
  nodes(tree).find(node => node.type === "Button" && node.props.title === "1 hour")!.props.onPress(); tree = view.render(); assert.equal(tree.props.footer.props.disabled, false);
  view.protocol({ ...fixed, allowedHours: [2, 3], evidence: { ...fixed.evidence, sampleHours: 2, startExample: "D8 SK1234FF 2", durationText: "2, 3 hours" } }); tree = view.render();
  assert.equal(tree.props.footer.props.disabled, true);
});

test("stop SMS uses the original parked plate after edits and retains reminder after composer open", async () => {
  const view = harness(true); view.changePlate(); const tree = view.render();
  tree.props.footer.props.onPress(); await view.respond();
  assert.equal(view.calls.length, 1); assert.equal(view.calls[0].body, "S"); assert.equal(view.stored.length, 0, "opening a composer does not claim parking stopped");
});
