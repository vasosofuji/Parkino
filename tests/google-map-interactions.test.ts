import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { groupParking } from "../src/domain/clusters";
import { parkingMarker } from "../src/domain/marker-appearance";
import { createOverlayTapGate } from "../src/domain/map-interactions";
import { SKOPJE } from "../src/domain/parking";
import type { ParkingMapProps } from "../src/components/mapTypes";
type Node = { type: string; props: Record<string, unknown>; children: (Node | Node[])[] };

function renderer() {
  const slots: unknown[] = [], effects: (() => void)[] = [];
  let cursor = 0;
  const memo = (fn: () => unknown, deps: unknown[]) => {
    const index = cursor++, previous = slots[index] as { deps: unknown[]; value: unknown } | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) slots[index] = { deps, value: fn() };
    return (slots[index] as { value: unknown }).value;
  };
  const React = {
    createElement: (type: string, props: Record<string, unknown>, ...children: Node[]) => ({ type, props: props ?? {}, children }),
    useRef(value: unknown) { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useState(value: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], (next: unknown) => { slots[index] = next; }]; },
    useCallback: (fn: () => unknown, deps: unknown[]) => memo(() => fn, deps),
    useEffect(fn: () => void, deps: unknown[]) { memo(() => { effects.push(fn); }, deps); },
  };
  const exports: { default?: (props: ParkingMapProps) => Node } = {};
  const source = ts.transpileModule(readFileSync("src/components/GoogleParkingMap.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInNewContext(source, { exports, require(name: string) {
    if (name === "react") return { ...React, default: React, __esModule: true };
    if (name === "react-native") return { StyleSheet: { create: (value: unknown) => value, absoluteFill: {} }, View: "View", Text: "Text" };
    if (name === "react-native-maps") return { __esModule: true, default: "MapView", Marker: "Marker", Polygon: "Polygon", Polyline: "Polyline", Circle: "Circle" };
    if (name.endsWith("clusters")) return { groupParking };
    if (name.endsWith("marker-appearance")) return { parkingMarker };
    if (name.endsWith("map-interactions")) return { createOverlayTapGate };
    if (name.endsWith("parking")) return { SKOPJE };
    throw new Error(name);
  } });
  return (props: ParkingMapProps, map: object) => {
    cursor = 0;
    const tree = exports.default!(props);
    (tree.props.ref as { current: object }).current = map;
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
}
const base: ParkingMapProps = { now: Date.now(), places: [], selectedId: "a", selectedAnchor: SKOPJE, destination: SKOPJE, userLocation: null, picking: false, showZones: true, onSelect() {}, onPick() {}, language: "en" };

test("a rejected projection for the old Google selection cannot erase a newer popup", async () => {
  const render = renderer(), positions: unknown[] = [], pending: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const map = { animateToRegion() {}, pointForCoordinate: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
  render({ ...base, onSelectedPosition: point => positions.push(point) }, map);
  render({ ...base, selectedId: "b", selectedAnchor: { ...SKOPJE, latitude: 42 }, onSelectedPosition: point => positions.push(point) }, map);
  pending[1].resolve({ x: 120, y: 250 }); await new Promise<void>(resolve => setImmediate(resolve));
  pending[0].reject(new Error("stale native request")); await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(positions, [{ x: 120, y: 250 }]);
});

test("a Google footprint tap picks its coordinate once while its paired map event is suppressed", () => {
  const picks: unknown[] = [], blanks: boolean[] = [];
  const place = { id: "p", name: "Parking", kind: "surface", coordinate: SKOPJE, geometry: { type: "Polygon", coordinates: [[[21.43, 41.99], [21.44, 41.99], [21.44, 42], [21.43, 41.99]]] }, access: "public", verification: "osm", zoneCode: null, operator: null, tariff: null, capacity: null, openingHours: null, source: { label: "OSM", url: "", retrievedAt: "" } } as ParkingMapProps["places"][number];
  const tree = renderer()({ ...base, places: [place], selectedId: "p", picking: true, selectionEnabled: false, onPick: point => picks.push(point), onBlankPress: () => blanks.push(true) }, { animateToRegion() {}, pointForCoordinate: async () => ({ x: 1, y: 1 }) });
  const find = (node: Node): Node | undefined => node.type === "Polygon" ? node : node.children.flat(Infinity).filter(Boolean).map(child => typeof child === "object" ? find(child as Node) : undefined).find(Boolean);
  const polygon = find(tree)!;
  const event = { nativeEvent: { coordinate: SKOPJE, action: "polygon-press" } };
  (polygon.props.onPress as (event: object) => void)(event);
  (tree.props.onPress as (event: object) => void)(event);
  assert.deepEqual(picks, [SKOPJE]); assert.equal(blanks.length, 0);
});
