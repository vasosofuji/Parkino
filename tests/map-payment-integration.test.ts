import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as filters from "../src/domain/parking-filters";
import * as parking from "../src/domain/parking";
import * as arrival from "../src/domain/arrival";
import * as geometry from "../src/domain/geometry";
import * as location from "../src/domain/location";
import * as feedback from "../src/domain/report-feedback";
import { MARKER_COLORS } from "../src/domain/marker-appearance";
import { paymentFix, paymentNow, paymentZone } from "./fixtures/zone-payment";
import type { ParkingPlace } from "../src/domain/types";

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const nodes = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "children" in value ? [value as Element, ...(value as Element).children.flatMap(nodes)] : [];
function harness(zoneOnly = false) {
  const priced: ParkingPlace = { ...paymentZone, tariff: { firstHour: 25, nextHour: 25, maxStayMinutes: null, evidence: "official", source: paymentZone.source } };
  const facility: ParkingPlace = { ...priced, id: "facility", kind: "surface", name: "Parking" };
  const state: unknown[] = [], effects: (() => void)[] = [], timers: (() => void)[] = [], payments: any[] = [], reports: string[] = [];
  let cursor = 0, focused = true, offerPlate = false;
  const gps = { location: paymentFix(), initialLocation: null, accuracy: 5, status: "ready", issue: null, arrival: (zoneOnly ? priced : facility) as ParkingPlace | null, arrivalFromNotification: false, dismiss() { gps.arrival = null; }, retry() {} };
  const react = { Fragment: "Fragment", createElement: (type: string, props: Record<string, any>, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }), useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = typeof value === "function" ? value() : value; return [state[index], (next: any) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; }, useRef(value: unknown) { const index = cursor++; return state[index] ?? (state[index] = { current: value }); }, useEffect(fn: () => void) { effects.push(fn); }, useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn };
  const context = { exports: {} as { default: () => Element }, setTimeout: (fn: () => void) => { timers.push(fn); return 0; }, clearTimeout() {}, require(name: string) {
    if (name === "react") return { ...react, default: react, __esModule: true };
    if (name === "react-native") return { Keyboard: { dismiss() {} }, Platform: { OS: "web" }, Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } };
    if (name === "react-native-safe-area-context") return { SafeAreaView: "SafeAreaView" };
    if (name === "expo-router") return { router: { push() {} }, useIsFocused: () => focused };
    if (name === "../state/ParkingContext") return { useParking: () => ({ catalog: { places: [priced, facility], destinations: [] }, connected: true, now: paymentNow, language: "en", t: (en: string) => en, refresh: async () => {} }) };
    if (name === "../state/ThemeContext") return { useTheme: () => ({ colors: {}, dark: false }) };
    if (name === "../state/ContributionFeedback") return { useContributionFeedback: () => ({ thankYou() {} }) };
    if (name === "../state/SettingsLocationContext") return { useMapSettingsLocation() {} };
    if (name === "../state/LicensePlateContext") return { useLicensePlate: () => ({ savedPlate: "SK1234FF", accountId: "account", ready: true, offerPlate, pendingStop: null }) };
    if (name === "../hooks/useArrival") return { useArrival: () => gps };
    if (name === "../hooks/useZonePayment") return { useZonePayment: (input: unknown) => { payments.push(input); return { place: null, validate() {}, dismiss() {} }; } };
    if (name === "../domain/parking-filters") return filters;
    if (name === "../domain/parking") return parking;
    if (name === "../domain/arrival") return arrival;
    if (name === "../domain/geometry") return geometry;
    if (name === "../domain/location") return location;
    if (name === "../domain/report-feedback") return feedback;
    if (name === "../domain/marker-appearance") return { MARKER_COLORS };
    if (name === "../services/api") return { api: { report: async (_id: string, status: string) => { reports.push(status); } } };
    if (name === "../components/ui") return { Button: "Button", Sheet: "Sheet", Note: "Note", Icon: "Icon", IconButton: "IconButton", RevealSection: "RevealSection" };
    if (name === "../components/ZonePaymentSheet") return { default: "ZonePaymentSheet", ParkingSmsStopSheet: "ParkingSmsStopSheet", __esModule: true };
    if (name.startsWith("../components/")) return { default: name, __esModule: true };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/screens/MapScreen.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  const render = () => { cursor = 0; effects.length = 0; return context.exports.default(); };
  return { render, payment: () => payments.at(-1), reports, runEffects: () => { effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); }, plateOffer: () => { offerPlate = true; }, blur: () => { focused = false; } };
}

test("actual MapScreen queues SMS while availability is open and releases it after a successful Yes report", async () => {
  const view = harness(); const tree = view.render();
  assert.equal(view.payment().blocked, true);
  const sheet = nodes(tree).find(node => node.type === "Sheet" && node.props.title === "Any free spaces here?")!;
  assert.equal(sheet.props.visible, true);
  nodes(sheet).find(node => node.type === "Button" && node.props.title === "Yes")!.props.onPress();
  await new Promise<void>(resolve => setImmediate(resolve)); view.render();
  assert.deepEqual(view.reports, ["spaces"]); assert.equal(view.payment().blocked, false);
});

test("known-price zone auto-dismiss does not disable SMS dwell, while plate setup and route blur remain blockers", () => {
  const view = harness(true); view.render(); assert.equal(view.payment().blocked, true);
  view.runEffects(); view.render(); assert.equal(view.payment().blocked, false);
  view.plateOffer(); const tree = view.render(); assert.equal(view.payment().blocked, true);
  assert.equal(nodes(tree).find(node => node.type === "Sheet" && node.props.title === "Any free spaces here?")!.props.visible, false);
  view.blur(); view.render(); assert.equal(view.payment().focused, false);
});
