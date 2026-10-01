import { mkdirSync, writeFileSync } from "node:fs";
import { mapHtml } from "../src/components/offlineMapHtml";
import catalog from "../data/catalog.json";
import { groupParking } from "../src/domain/clusters";
import type { Catalog } from "../src/domain/types";
const places = (catalog as Catalog).places;
const payload = {
  pins: groupParking(places, 0.0015, 0.002, null).map((members) => ({
    id: members[0].id,
    point: [members[0].coordinate.latitude, members[0].coordinate.longitude],
    title: members[0].name,
    label: String(
      members.length > 1
        ? members.length
        : (members[0].tariff?.firstHour ?? "P"),
    ),
    color: "#153D3A",
    cluster: members.length > 1,
    selected: false,
  })),
  zones: places
    .filter((p) => p.kind === "zone" && p.geometry)
    .map((p) => ({
      id: p.id,
      rings: p.geometry!.coordinates.map((ring) =>
        ring.map(([lng, lat]) => [lat, lng]),
      ),
    })),
  destination: [41.9961, 21.4316],
  userLocation: null,
  selectedId: null,
  picking: false,
};
const bridge =
  '<script>window.ReactNativeWebView={postMessage:message=>{const state=document.getElementById("bridge-state");if(state)state.textContent=message;}};</script>';
const status =
  '<div id="bridge-state" style="position:fixed;z-index:9999;bottom:30px;left:10px;background:white;padding:8px;font:12px system-ui">Map bridge ready</div>';
const update =
  "<script>window.renderParking(" +
  JSON.stringify(payload).replace(/</g, "\\u003c") +
  ");</script>";
mkdirSync("preview", { recursive: true });
writeFileSync(
  "preview/native-map.html",
  mapHtml
    .replace("</head>", bridge + "</head>")
    .replace("</body>", status + update + "</body>"),
);
console.log("Generated isolated native-map HTML preview.");
