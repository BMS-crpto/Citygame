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

        static void MakeFootprint(Transform root, LagosMapFeature f, Material material)
        {
            if (f.points.Length < 3) return;
            float h = Mathf.Clamp(f.height, 3f, 65f);
            GameObject go = new GameObject(string.IsNullOrEmpty(f.name) ? "OSM building" : f.name);
            go.transform.SetParent(root, false);
            Mesh mesh = new Mesh { name = "OSM building footprint" };
            int n = f.points.Length;
            Vector3[] v = new Vector3[n*2];
            for(int i=0;i<n;i++){v[i]=new Vector3(f.points[i].x,0,f.points[i].y);v[i+n]=new Vector3(f.points[i].x,h,f.points[i].y);}
            List<int> tri = new List<int>();
            for(int i=1;i<n-1;i++){tri.Add(0);tri.Add(i+1);tri.Add(i);tri.Add(n);tri.Add(n+i);tri.Add(n+i+1);}
            for(int i=0;i<n;i++){int j=(i+1)%n;tri.Add(i);tri.Add(j);tri.Add(j+n);tri.Add(i);tri.Add(j+n);tri.Add(i+n);}
            mesh.vertices=v; mesh.triangles=tri.ToArray(); mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial=material;
            go.AddComponent<MeshCollider>().sharedMesh=mesh;
        }

        static void MakeFlatPolygon(Transform root, LagosMapFeature f, Material material)
        {
            if(f.points.Length<3)return;
            GameObject go=new GameObject(string.IsNullOrEmpty(f.name)?f.kind:f.name);
            go.transform.SetParent(root,false);
            Mesh mesh=new Mesh();
            Vector3[] v=new Vector3[f.points.Length];
            for(int i=0;i<v.Length;i++)v[i]=new Vector3(f.points[i].x,.015f,f.points[i].y);
            List<int> t=new List<int>();
            for(int i=1;i<v.Length-1;i++){t.Add(0);t.Add(i);t.Add(i+1);}
            mesh.vertices=v;mesh.triangles=t.ToArray();mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial=material;
        }

        static Material Mat(Color color)
        {
            Shader shader=Shader.Find("Universal Render Pipeline/Lit");
            if(shader==null)shader=Shader.Find("Standard");
            Material m=new Material(shader);m.color=color;return m;
        }
    }
}