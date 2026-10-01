"""Read operator map points without executing the remote JavaScript.

The operator's map uses legacy A1/A5/A6 labels; its zone inventory names the
same Agromehanika / Orce Nikolov / Maksim Gorki sites A01/A05/A06.
Points are label anchors only: no boundary or parking entrance is inferred.
"""
from pathlib import Path
import json, re, urllib.request
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
url = "https://www.gradskiparking.com.mk/mapa-lokacii-nova.nspx"
raw = root / "data/raw/gradski-map.html"
raw.parent.mkdir(parents=True, exist_ok=True)
response = urllib.request.urlopen(url, timeout=30).read()
raw.write_bytes(response)
html = response.decode("utf-8-sig")
catalog_path = root / "data/catalog.json"
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
inventory = {zone["code"]: zone for zone in catalog["zones"]}
letters = str.maketrans({"А": "A", "Б": "B", "В": "B", "Ц": "C", "С": "C", "Д": "D"})
aliases = {"A1": "A01", "A5": "A05", "A6": "A06"}
anchors = {}
excluded = []
for title, lat, lon in re.findall(r"<h2>([^<]+)</h2>[\s\S]*?t\.lat\s*=\s*([0-9.]+)[\s\S]*?t\.lng\s*=\s*([0-9.]+)", html):
    match = re.match(r"(?:ЗОНА\s+)?([A-DАБВЦСД]\d+)\b", title)
    if not match:
        continue
    code = match[1].translate(letters)
    code = aliases.get(code, code)
    if code not in inventory:
        excluded.append({"mapLabel": title, "reason": "Not in the current zone inventory"})
        continue
    latitude, longitude = float(lat), float(lon)
    if not (41.91 <= latitude <= 42.08 and 21.3 <= longitude <= 21.58):
        raise ValueError("Operator coordinate outside Skopje")
    # D8 has two published points; retain one representative label per zone.
    anchors.setdefault(code, {"coordinate": {"latitude": latitude, "longitude": longitude}, "mapLabel": title})
if len(anchors) < 20:
    raise ValueError("Operator map format changed; inspect before importing")
source = {"label": "JP Gradski Parking official map · area reference", "url": url, "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
snapshot = {"source": source, "anchors": anchors, "excluded": excluded}
(root / "data/gradski-map-anchors.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for code, value in anchors.items():
    place = next((p for p in catalog["places"] if p["id"] == "gradski:zone:" + code), None)
    if not place:
        zone = inventory[code]
        place = {"id": "gradski:zone:" + code, "name": zone["name"], "kind": "zone", "operator": "gradski", "zoneCode": code, "access": "unknown", "tariff": zone["tariff"], "capacity": None, "openingHours": None, "verification": "official", "source": zone["source"]}
        catalog["places"].append(place)
    place.update(coordinate=value["coordinate"], anchorSource=source, locationPrecision="area")
catalog["generatedAt"] = source["retrievedAt"]
catalog["coverage"]["notes"] = [note.replace("Gradski labels are approximate street/landmark anchors, not legal boundaries or vehicle entrances. A01 and A02 still lack reliable map anchors.", "Gradski labels use operator map coordinates where available, otherwise street/landmark references. They are not legal boundaries or vehicle entrances. A02 still has no map anchor.") for note in catalog["coverage"]["notes"]]
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Updated {len(anchors)} official zone anchors; excluded {len(excluded)} legacy map-only code(s).")
