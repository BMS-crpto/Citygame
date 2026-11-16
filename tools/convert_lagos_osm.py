#!/usr/bin/env python3
"""Convert an OSM-derived GeoJSON FeatureCollection into compact Unity map data.

Usage:
  python tools/convert_lagos_osm.py lagos.geojson unity/Assets/Resources/LagosMapData.json

The input should cover the chosen Lagos play area and contain OSM tags in feature properties.
Coordinates are projected locally in metres around central Lagos (6.5244, 3.3792).\nUnity JsonUtility requires Vector2 points as {x,y} objects, not coordinate arrays.
"""
import json, math, sys
from pathlib import Path

ORIGIN_LAT, ORIGIN_LON = 6.5244, 3.3792
METRES_PER_DEG_LAT = 111132.0
METRES_PER_DEG_LON = 111320.0 * math.cos(math.radians(ORIGIN_LAT))
ROAD_WIDTH = {
    "motorway": 15, "trunk": 13, "primary": 12, "secondary": 10,
    "tertiary": 8, "residential": 6, "unclassified": 5,
    "service": 4, "living_street": 5, "pedestrian": 4, "footway": 2.5,
    "path": 2.5, "track": 3
}

def local_point(pair):
    lon, lat = pair[:2]
    return [round((lon-ORIGIN_LON)*METRES_PER_DEG_LON, 2),
            round((lat-ORIGIN_LAT)*METRES_PER_DEG_LAT, 2)]

def height_for(tags):
    try:
        if tags.get("height"):
            return float(str(tags["height"]).replace("m", "").strip())
    except ValueError:
        pass
    try:
        return max(3.0, float(tags.get("building:levels", 1)) * 3.2)
    except (ValueError, TypeError):
        return 6.0

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: convert_lagos_osm.py input.geojson output.json")
    source, output = map(Path, sys.argv[1:])
    raw = json.loads(source.read_text(encoding="utf-8"))
    features = []
    for feature in raw.get("features", []):
        tags = feature.get("properties") or {}
        geom = feature.get("geometry") or {}
        typ, coords = geom.get("type"), geom.get("coordinates")
        name = str(tags.get("name") or tags.get("name:en") or "")
        if typ == "LineString":
            lines = [coords]
        elif typ == "MultiLineString":
            lines = coords
        else:
            lines = []
        highway = tags.get("highway")
        if highway:
            for line in lines:
                if len(line) >= 2:
                    features.append({"kind":"road","name":name,"roadClass":str(highway),
                                     "width":ROAD_WIDTH.get(str(highway),4),
                                     "height":0,"points":[local_point(p) for p in line]})
            continue
        building = tags.get("building")
        if building and typ == "Polygon" and coords:
            ring = coords[0]
            if len(ring) >= 4:
                features.append({"kind":"building","name":name,"roadClass":"",
                                 "width":0,"height":height_for(tags),
                                 "points":[local_point(p) for p in ring[:-1]]})
            continue
        if typ == "Polygon" and coords:
            ring = coords[0]
            kind = "water" if tags.get("natural") == "water" or tags.get("waterway") else (
                "park" if tags.get("leisure") == "park" or tags.get("landuse") in ("grass","recreation_ground") else "")
            if kind and len(ring) >= 4:
                features.append({"kind":kind,"name":name,"roadClass":"",
                                 "width":0,"height":0,
                                 "points":[local_point(p) for p in ring[:-1]]})
    if not features:
        raise SystemExit("No usable OSM roads/buildings/water/park features found in input.")
    doc = {"source":"OpenStreetMap","attribution":"© OpenStreetMap contributors (ODbL)",
           "originLat":ORIGIN_LAT,"originLon":ORIGIN_LON,"features":features}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(doc,separators=(",",":")),encoding="utf-8")
    counts = {k:sum(1 for f in features if f["kind"]==k) for k in ("road","building","water","park")}
    print("Wrote",len(features),"features to",output,counts)

if __name__ == "__main__":
    main()
