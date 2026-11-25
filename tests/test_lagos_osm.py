import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from download_lagos_osm import element_to_feature, features_from_payload
from convert_lagos_osm import feature_to_map_features


def way(tags, coords):
    return {
        "type": "way",
        "tags": tags,
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in coords]
    }


class OSMConverterTests(unittest.TestCase):
    def test_closed_waterway_polygon_is_preserved_as_water(self):
        feature = {
            "properties": {"waterway": "riverbank", "name": "Lagoon"},
            "geometry": {"type": "Polygon", "coordinates": [[
                [3.3, 6.5], [3.31, 6.5], [3.31, 6.51],
                [3.3, 6.51], [3.3, 6.5]
            ]]}
        }
        converted = feature_to_map_features(feature)
        self.assertEqual(len(converted), 1)
        self.assertEqual(converted[0]["kind"], "water")
        self.assertEqual(converted[0]["name"], "Lagoon")
        self.assertEqual(len(converted[0]["points"]), 4)

    def test_open_waterway_line_is_preserved(self):
        feature = {
            "properties": {"waterway": "stream"},
            "geometry": {"type": "LineString", "coordinates": [
                [3.3, 6.5], [3.31, 6.51]
            ]}
        }
        converted = feature_to_map_features(feature)
        self.assertEqual(converted[0]["kind"], "waterline")
        self.assertEqual(len(converted[0]["points"]), 2)

    def test_natural_water_polygon_is_preserved(self):
        feature = {
            "properties": {"natural": "water"},
            "geometry": {"type": "Polygon", "coordinates": [[
                [3.3, 6.5], [3.31, 6.5], [3.31, 6.51],
                [3.3, 6.51], [3.3, 6.5]
            ]]}
        }
        converted = feature_to_map_features(feature)
        self.assertEqual(converted[0]["kind"], "water")


    def test_height_tag_in_metres(self):
        self.assertEqual(feature_to_map_features({
            "properties": {"building": "yes", "height": "12.5 m"},
            "geometry": {"type": "Polygon", "coordinates": [[
                [3.3, 6.5], [3.31, 6.5], [3.31, 6.51],
                [3.3, 6.51], [3.3, 6.5]
            ]]}
        })[0]["height"], 12.5)

    def test_height_tag_in_feet_converts_to_metres(self):
        converted = feature_to_map_features({
            "properties": {"building": "yes", "height": "30 ft"},
            "geometry": {"type": "Polygon", "coordinates": [[
                [3.3, 6.5], [3.31, 6.5], [3.31, 6.51],
                [3.3, 6.51], [3.3, 6.5]
            ]]}
        })
        self.assertAlmostEqual(converted[0]["height"], 9.144, places=3)

    def test_comma_decimal_height_and_level_fallback(self):
        polygon = [[3.3, 6.5], [3.31, 6.5], [3.31, 6.51],
                   [3.3, 6.51], [3.3, 6.5]]
        decimal = feature_to_map_features({
            "properties": {"building": "yes", "height": "12,5m"},
            "geometry": {"type": "Polygon", "coordinates": [polygon]}
        })
        fallback = feature_to_map_features({
            "properties": {"building": "yes", "height": "unknown", "building:levels": "5"},
            "geometry": {"type": "Polygon", "coordinates": [polygon]}
        })
        self.assertEqual(decimal[0]["height"], 12.5)
        self.assertEqual(fallback[0]["height"], 16.0)


class OSMFeatureExportTests(unittest.TestCase):
    def test_open_waterway_is_exported_as_line(self):
        item = way({"waterway": "stream", "name": "Test stream"},
                   [(3.3, 6.5), (3.31, 6.51), (3.32, 6.52)])
        feature = element_to_feature(item)
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertEqual(feature["properties"]["waterway"], "stream")

    def test_coastline_is_exported_as_line(self):
        feature = element_to_feature(way({"natural": "coastline"},
                                         [(3.3, 6.5), (3.31, 6.51)]))
        self.assertEqual(feature["geometry"]["type"], "LineString")

    def test_closed_waterway_is_exported_as_polygon(self):
        ring = [(3.3, 6.5), (3.31, 6.5), (3.31, 6.51), (3.3, 6.5)]
        feature = element_to_feature(way({"waterway": "riverbank"}, ring))
        self.assertEqual(feature["geometry"]["type"], "Polygon")
        self.assertEqual(len(feature["geometry"]["coordinates"]), 1)

    def test_closed_building_is_exported_as_polygon(self):
        ring = [(3.3, 6.5), (3.31, 6.5), (3.31, 6.51), (3.3, 6.5)]
        feature = element_to_feature(way({"building": "yes"}, ring))
        self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_closed_park_is_exported_as_polygon(self):
        ring = [(3.3, 6.5), (3.31, 6.5), (3.31, 6.51), (3.3, 6.5)]
        feature = element_to_feature(way({"leisure": "park"}, ring))
        self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_highway_is_exported_as_line(self):
        feature = element_to_feature(way({"highway": "residential"},
                                         [(3.3, 6.5), (3.31, 6.51)]))
        self.assertEqual(feature["geometry"]["type"], "LineString")

    def test_irrelevant_or_incomplete_ways_are_ignored(self):
        self.assertIsNone(element_to_feature(way({"building": "yes"},
                                                 [(3.3, 6.5), (3.31, 6.51)])))
        self.assertIsNone(element_to_feature({"type": "node", "geometry": []}))
        self.assertIsNone(element_to_feature({"type": "way", "tags": {}}))

    def test_payload_filters_and_preserves_features(self):
        payload = {"elements": [
            way({"waterway": "stream"}, [(3.3, 6.5), (3.31, 6.51)]),
            {"type": "node", "geometry": []},
            way({"building": "yes"}, [(3.3, 6.5), (3.31, 6.51)])
        ]}
        features = features_from_payload(payload)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["properties"]["waterway"], "stream")


if __name__ == "__main__":
    unittest.main()
