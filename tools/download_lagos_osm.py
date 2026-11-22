#!/usr/bin/env python3
"""Download one bounded Lagos OSM extract as GeoJSON for the Unity converter.

Default coverage is the first Lagos Island–Ikoyi–Victoria Island–western Lekki
playable region. Keep extracts focused; do not repeatedly hammer public Overpass.
"""
import json, sys, urllib.parse, urllib.request
from pathlib import Path

ENDPOINT = "https://overpass-api.de/api/interpreter"
DEFAULT_BBOX = (6.42, 3.30, 6.55, 3.50)  # south, west, north, east


def element_to_feature(item):
    """Convert one Overpass way into GeoJSON, preserving useful waterway lines."""
    if item.get("type") != "way" or not item.get("geometry"):
        return None

    tags = item.get("tags") or {}
    coords = [[p["lon"], p["lat"]] for p in item["geometry"]]
    if len(coords) < 2:
        return None

    highway = tags.get("highway")
    if highway:
        geom_type, geometry = "LineString", coords
    elif tags.get("natural") == "coastline":
        # Coastlines are line features; don't discard them just because the
        # shoreline way is open rather than a closed polygon.
        geom_type, geometry = "LineString", coords
    elif tags.get("waterway"):
        if len(coords) >= 4 and coords[0] == coords[-1]:
            geom_type, geometry = "Polygon", [coords]
        else:
            geom_type, geometry = "LineString", coords
    elif len(coords) >= 4 and coords[0] == coords[-1] and (
        tags.get("building") or tags.get("natural") == "water" or
        tags.get("leisure") == "park" or
        tags.get("landuse") in ("grass", "recreation_ground")
    ):
        geom_type, geometry = "Polygon", [coords]
    else:
        return None

    return {
        "type": "Feature",
        "properties": tags,
        "geometry": {"type": geom_type, "coordinates": geometry}
    }


def features_from_payload(payload):
    return [feature for item in payload.get("elements", [])
            if (feature := element_to_feature(item)) is not None]


def main():
    if len(sys.argv) not in (2, 6):
        raise SystemExit("Usage: python tools/download_lagos_osm.py output.geojson [south west north east]")
    output = Path(sys.argv[1])
    south, west, north, east = DEFAULT_BBOX if len(sys.argv) == 2 else map(float, sys.argv[2:])
    if not (south < north and west < east and north-south <= .25 and east-west <= .25):
        raise SystemExit("Choose a valid bbox no larger than 0.25 degrees per side.")
    bbox = f"{south},{west},{north},{east}"
    query = f'''[out:json][timeout:180];
(
  way["highway"]({bbox});
  way["building"]({bbox});
  way["natural"="water"]({bbox});
  way["natural"="coastline"]({bbox});
  way["waterway"]({bbox});
  way["leisure"="park"]({bbox});
  way["landuse"~"grass|recreation_ground"]({bbox});
);
out body geom;'''
    request = urllib.request.Request(
        ENDPOINT, data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "Citygame-Lagos-Map-Importer/1.0 (OSM data export)"})
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise SystemExit(f"OSM download failed: {exc}. Try again later or use a Geofabrik extract.")

    features = features_from_payload(payload)
    if not features:
        raise SystemExit("No usable OSM ways returned for this bounding box.")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(features)} OSM features to {output}")
    print("Attribution required: © OpenStreetMap contributors. Data is ODbL.")


if __name__ == "__main__":
    main()
