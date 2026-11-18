using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Citygame.World
{
    [Serializable] public class LagosMapDocument { public string source; public string attribution; public float originLat; public float originLon; public LagosMapFeature[] features; }
    [Serializable] public class LagosMapFeature { public string kind; public string name; public string roadClass; public float width; public float height; public Vector2[] points; }

    public static class LagosRealMapImporter
    {
        public static bool TryBuild(Transform parent)
        {
            TextAsset asset = Resources.Load<TextAsset>("LagosMapData");
            if (asset == null) return false;
            LagosMapDocument doc;
            try { doc = JsonUtility.FromJson<LagosMapDocument>(asset.text); }
            catch (Exception e) { Debug.LogError("Lagos map data could not be parsed: " + e.Message); return false; }
            if (doc == null || doc.features == null || doc.features.Length == 0) return false;

            Transform root = new GameObject("REAL LAGOS • OPENSTREETMAP DATA").transform;
            root.SetParent(parent, false);
            Material road = Mat(new Color(.12f,.13f,.14f));
            Material water = Mat(new Color(.08f,.34f,.48f));
            Material park = Mat(new Color(.20f,.38f,.20f));
            Material building = Mat(new Color(.57f,.49f,.39f));
            int roads = 0, buildings = 0, waterCount = 0;
            foreach (LagosMapFeature f in doc.features)
            {
                if (f == null || f.points == null || f.points.Length < 2) continue;
                if (f.kind == "road") { MakeRoad(root, f, road); roads++; }
                else if (f.kind == "building") { MakeFootprint(root, f, building); buildings++; }
                else if (f.kind == "water") { MakeFlatPolygon(root, f, water); waterCount++; }
                else if (f.kind == "waterline") MakeWaterLine(root, f, water);
                else if (f.kind == "park") MakeFlatPolygon(root, f, park);
            }
            Debug.Log("Imported real Lagos OSM geometry: " + roads + " roads, " + buildings + " building footprints, " + waterCount + " water features. " + doc.attribution);
            return roads > 0;
        }

        static void MakeRoad(Transform root, LagosMapFeature f, Material material)
        {
            GameObject go = new GameObject(string.IsNullOrEmpty(f.name) ? "OSM road" : f.name);
            go.transform.SetParent(root, false);
            int n = f.points.Length;
            float halfWidth = Mathf.Clamp(f.width, 2f, 18f) * .5f;
            Vector3[] vertices = new Vector3[n * 2];
            int[] triangles = new int[(n - 1) * 6];
            for (int i = 0; i < n; i++)
            {
                Vector2 before = f.points[Mathf.Max(0, i - 1)];
                Vector2 after = f.points[Mathf.Min(n - 1, i + 1)];
                Vector2 tangent = (after - before).normalized;
                Vector2 side = new Vector2(-tangent.y, tangent.x) * halfWidth;
                vertices[i * 2] = new Vector3(f.points[i].x + side.x, .025f, f.points[i].y + side.y);
                vertices[i * 2 + 1] = new Vector3(f.points[i].x - side.x, .025f, f.points[i].y - side.y);
                if (i == n - 1) continue;
                int t = i * 6, v = i * 2;
                triangles[t] = v; triangles[t + 1] = v + 2; triangles[t + 2] = v + 1;
                triangles[t + 3] = v + 1; triangles[t + 4] = v + 2; triangles[t + 5] = v + 3;
            }
            Mesh mesh = new Mesh { name = "OSM drivable road surface" };
            mesh.vertices = vertices; mesh.triangles = triangles; mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
        }

        static void MakeWaterLine(Transform root, LagosMapFeature f, Material material)
        {
            GameObject go = new GameObject(string.IsNullOrEmpty(f.name) ? "OSM waterway" : f.name);
            go.transform.SetParent(root, false);
            LineRenderer line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = false; line.positionCount = f.points.Length;
            line.widthMultiplier = Mathf.Clamp(f.width, 3f, 24f);
            line.sharedMaterial = material; line.numCapVertices = 3; line.numCornerVertices = 3;
            for (int i = 0; i < f.points.Length; i++)
                line.SetPosition(i, new Vector3(f.points[i].x, .02f, f.points[i].y));
        }

        static float Cross(Vector2 a, Vector2 b)
        {
            return a.x * b.y - a.y * b.x;
        }

        static float Cross(Vector2 a, Vector2 b, Vector2 c)
        {
            return Cross(b - a, c - a);
        }

        static float SignedArea(List<Vector2> polygon)
        {
            double area = 0d;
            for (int i = 0; i < polygon.Count; i++)
            {
                Vector2 a = polygon[i];
                Vector2 b = polygon[(i + 1) % polygon.Count];
                area += (double)a.x * b.y - (double)b.x * a.y;
            }
            return (float)(area * 0.5d);
        }

        // OSM rings can contain duplicate or collinear nodes. Remove those
        // before triangulation and normalize the outline to counter-clockwise.
        static List<Vector2> CleanPolygon(Vector2[] points)
        {
            List<Vector2> polygon = new List<Vector2>(points.Length);
            for (int i = 0; i < points.Length; i++)
            {
                Vector2 point = points[i];
                if (polygon.Count == 0 || (point - polygon[polygon.Count - 1]).sqrMagnitude > 0.0001f)
                    polygon.Add(point);
            }

            if (polygon.Count > 2 && (polygon[0] - polygon[polygon.Count - 1]).sqrMagnitude <= 0.0001f)
                polygon.RemoveAt(polygon.Count - 1);

            bool changed = true;
            int passes = 0;
            while (changed && polygon.Count >= 3 && passes++ < points.Length * 2)
            {
                changed = false;
                for (int i = 0; i < polygon.Count; i++)
                {
                    Vector2 previous = polygon[(i + polygon.Count - 1) % polygon.Count];
                    Vector2 current = polygon[i];
                    Vector2 next = polygon[(i + 1) % polygon.Count];
                    Vector2 first = current - previous;
                    Vector2 second = next - current;
                    if (Mathf.Abs(Cross(first, second)) <= 0.001f && Vector2.Dot(first, second) >= -0.001f)
                    {
                        polygon.RemoveAt(i);
                        changed = true;
                        break;
                    }
                }
            }

            if (polygon.Count >= 3 && SignedArea(polygon) < 0f)
                polygon.Reverse();
            return polygon;
        }

        static bool PointInTriangle(Vector2 point, Vector2 a, Vector2 b, Vector2 c)
        {
            const float epsilon = 0.0001f;
            return Cross(a, b, point) >= -epsilon &&
                   Cross(b, c, point) >= -epsilon &&
                   Cross(c, a, point) >= -epsilon;
        }

        // Ear clipping handles concave OSM footprints; a triangle fan can
        // cross outside concave outlines and leave gaps in the city surface.
        static List<int> TriangulatePolygon(List<Vector2> polygon)
        {
            List<int> triangles = new List<int>(polygon.Count > 2 ? (polygon.Count - 2) * 3 : 0);
            if (polygon.Count < 3 || Mathf.Abs(SignedArea(polygon)) <= 0.0001f)
                return triangles;

            List<int> remaining = new List<int>(polygon.Count);
            for (int i = 0; i < polygon.Count; i++)
                remaining.Add(i);

            int safety = polygon.Count * polygon.Count;
            while (remaining.Count > 3 && safety-- > 0)
            {
                bool foundEar = false;
                for (int i = 0; i < remaining.Count; i++)
                {
                    int previous = remaining[(i + remaining.Count - 1) % remaining.Count];
                    int current = remaining[i];
                    int next = remaining[(i + 1) % remaining.Count];
                    if (Cross(polygon[previous], polygon[current], polygon[next]) <= 0.0001f)
                        continue;

                    bool containsVertex = false;
                    for (int j = 0; j < remaining.Count; j++)
                    {
                        int candidate = remaining[j];
                        if (candidate == previous || candidate == current || candidate == next)
                            continue;
                        if (PointInTriangle(polygon[candidate], polygon[previous], polygon[current], polygon[next]))
                        {
                            containsVertex = true;
                            break;
                        }
                    }

                    if (containsVertex)
                        continue;

                    triangles.Add(previous);
                    triangles.Add(current);
                    triangles.Add(next);
                    remaining.RemoveAt(i);
                    foundEar = true;
                    break;
                }

                if (!foundEar)
                    return new List<int>();
            }

            if (remaining.Count == 3)
            {
                triangles.Add(remaining[0]);
                triangles.Add(remaining[1]);
                triangles.Add(remaining[2]);
            }
            return triangles;
        }

        static void MakeFootprint(Transform root, LagosMapFeature f, Material material)
        {
            List<Vector2> polygon = CleanPolygon(f.points);
            List<int> caps = TriangulatePolygon(polygon);
            if (caps.Count < 3)
            {
                Debug.LogWarning("Skipping invalid OSM building footprint: " + f.name);
                return;
            }

            float height = Mathf.Clamp(f.height, 3f, 65f);
            int count = polygon.Count;
            Vector3[] vertices = new Vector3[count * 2];
            for (int i = 0; i < count; i++)
            {
                Vector2 point = polygon[i];
                vertices[i] = new Vector3(point.x, 0f, point.y);
                vertices[i + count] = new Vector3(point.x, height, point.y);
            }

            // The normalized outline is counter-clockwise in map coordinates.
            // Bottom faces point down, top faces point up, and side faces point out.
            List<int> triangles = new List<int>(caps.Count * 2 + count * 6);
            for (int i = 0; i < caps.Count; i += 3)
            {
                int a = caps[i];
                int b = caps[i + 1];
                int c = caps[i + 2];
                triangles.Add(a); triangles.Add(b); triangles.Add(c);
                triangles.Add(a + count); triangles.Add(c + count); triangles.Add(b + count);
            }

            for (int i = 0; i < count; i++)
            {
                int next = (i + 1) % count;
                triangles.Add(i); triangles.Add(next + count); triangles.Add(next);
                triangles.Add(i); triangles.Add(i + count); triangles.Add(next + count);
            }

            GameObject go = new GameObject(string.IsNullOrEmpty(f.name) ? "OSM building" : f.name);
            go.transform.SetParent(root, false);
            Mesh mesh = new Mesh { name = "OSM building footprint" };
            mesh.vertices = vertices;
            mesh.triangles = triangles.ToArray();
            mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
        }

        static void MakeFlatPolygon(Transform root, LagosMapFeature f, Material material)
        {
            List<Vector2> polygon = CleanPolygon(f.points);
            List<int> indices = TriangulatePolygon(polygon);
            if (indices.Count < 3)
            {
                Debug.LogWarning("Skipping invalid OSM " + f.kind + " polygon: " + f.name);
                return;
            }

            GameObject go = new GameObject(string.IsNullOrEmpty(f.name) ? f.kind : f.name);
            go.transform.SetParent(root, false);
            Vector3[] vertices = new Vector3[polygon.Count];
            for (int i = 0; i < vertices.Length; i++)
                vertices[i] = new Vector3(polygon[i].x, 0.015f, polygon[i].y);

            // Reverse the counter-clockwise map winding so the visible surface faces up.
            List<int> triangles = new List<int>(indices.Count);
            for (int i = 0; i < indices.Count; i += 3)
            {
                triangles.Add(indices[i]);
                triangles.Add(indices[i + 2]);
                triangles.Add(indices[i + 1]);
            }

            Mesh mesh = new Mesh { name = "OSM " + f.kind + " polygon" };
            mesh.vertices = vertices;
            mesh.triangles = triangles.ToArray();
            mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
        }

        static Material Mat(Color color)
        {
            Shader shader=Shader.Find("Universal Render Pipeline/Lit");
            if(shader==null)shader=Shader.Find("Standard");
            Material m=new Material(shader);m.color=color;return m;
        }
    }
}