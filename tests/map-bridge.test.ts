import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mapHtml } from "../src/components/offlineMapHtml";

type Callback = (value?: unknown) => void;
function bridge() {
  const messages: { type: string; sentAt: number; selectionId?: string; anchor?: number[]; point?: unknown }[] = [];
  const mapEvents = new Map<string, Callback>(), windowEvents = new Map<string, Callback>();
  const markers: { options: Record<string, unknown>; events: Map<string, Callback> }[] = [];
  const invalidations: unknown[] = [];
  let userDots = 0, moves = 0, clears = 0;
  const layer = () => {
    const events = new Map<string, Callback>();
    return { events, on(name: string, fn: Callback) { events.set(name, fn); return this; }, off() {}, addTo() { return this; }, remove() {}, bringToFront() {}, setLatLng() { moves++; return this; }, setRadius() { return this; }, setLatLngs() {}, bindTooltip() { return this; } };
  };
  const map = { on(name: string, fn: Callback) { mapEvents.set(name, fn); return this; }, setView() { return this; }, getZoom: () => 15, getCenter: () => ({ lat: 42, lng: 21 }), latLngToContainerPoint: (p: number[]) => ({ x: p[1] * 10, y: p[0] * 10 }), invalidateSize(options: unknown) { invalidations.push(options); }, getBounds: () => ({ intersects: () => true }) };
  const window = { ReactNativeWebView: { postMessage: (value: string) => messages.push(JSON.parse(value)) }, addEventListener: (name: string, fn: Callback) => windowEvents.set(name, fn) } as unknown as { renderParking: (next: object) => void; updateUserLocation: (point: number[] | null, accuracy: number | null) => void };
  const L = {
    map: () => map, tileLayer: layer, layerGroup: () => ({ ...layer(), getLayers: () => [], clearLayers() { clears++; } }),
    marker: (_point: unknown, options: Record<string, unknown>) => { const next = layer(); markers.push({ options, events: next.events }); return next; },
    polygon: layer, polyline: layer, circle: layer, circleMarker: () => { userDots++; return layer(); }, divIcon: (value: unknown) => value, latLngBounds: () => ({}), DomEvent: { stopPropagation() {} },
  };
  const document = { getElementById: () => ({ classList: { toggle() {} } }), createElement: () => ({ textContent: "", style: { cssText: "" } }) };
  const script = mapHtml.split("</script><script>")[1].split("</script>")[0];
  vm.runInNewContext(script, { window, document, L });
  return { window, messages, markers, mapEvents, windowEvents, invalidations, counts: () => ({ userDots, moves, clears }) };
}
const payload = { pins: [{ id: "one", point: [42, 21], title: "Parking", html: "<span>?</span>", selected: true }], zones: [], destination: [42, 21], selectedId: "one", selectedAnchor: [42, 21], picking: false, draft: [] };

test("the native Leaflet bridge tags projections and never pans/resizes the camera just to select a pin", () => {
  const view = bridge();
  view.window.renderParking(payload);
  assert.equal(view.markers[0].options.autoPanOnFocus, false);
  assert.deepEqual(view.invalidations, []);
  const first = view.messages.at(-1)!;
  assert.equal(first.selectionId, "one"); assert.deepEqual(first.anchor, [42, 21]);
  view.window.renderParking({ ...payload, selectedId: "two", selectedAnchor: [42.01, 21.01] });
  assert.equal(view.messages.at(-1)?.selectionId, "two");
  assert.deepEqual(view.messages.at(-1)?.anchor, [42.01, 21.01]);
  view.windowEvents.get("resize")?.();
  assert.equal((view.invalidations[0] as { pan: boolean }).pan, false);
});

test("blank taps and boundary picks stay separate; one-second GPS updates move the dot without rebuilding parking", () => {
  const view = bridge();
  view.window.renderParking(payload);
  view.mapEvents.get("click")?.({ latlng: { lat: 42, lng: 21 } });
  assert.equal(view.messages.at(-1)?.type, "blank");
  view.window.renderParking({ ...payload, picking: true });
  view.mapEvents.get("click")?.({ latlng: { lat: 42, lng: 21 } });
  assert.equal(view.messages.at(-1)?.type, "pick");
  const clears = view.counts().clears;
  view.window.updateUserLocation([42, 21], 10);
  for (let i = 1; i < 10; i++) view.window.updateUserLocation([42 + i / 10000, 21], 10);
  assert.equal(view.counts().userDots, 1);
  assert.equal(view.counts().clears, clears);
  assert.equal(view.counts().moves, 18);
});

test("cluster and destination taps send explicit interaction events, while programmatic camera updates do not", () => {
  const view = bridge();
  view.window.renderParking({ ...payload, pins: [{ ...payload.pins[0], cluster: true }], destinationMarker: [42, 21] });
  assert.ok(!view.messages.some(message => message.type === "interaction"));
  view.markers[0].events.get("click")?.();
  assert.equal(view.messages.at(-1)?.type, "interaction");
  assert.ok(Number.isFinite(view.messages.at(-1)?.sentAt));
  view.markers[1].events.get("click")?.();
  assert.equal(view.messages.filter(message => message.type === "interaction").length, 2);
});
