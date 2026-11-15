using UnityEngine;
using Citygame.Business;

namespace Citygame.World
{
    /// <summary>Lightweight procedural interior instance for storefront exploration.</summary>
    public sealed class BusinessInterior : MonoBehaviour
    {
        public static BusinessInterior Create(BusinessSpot spot, Vector3 origin)
        {
            GameObject root = new GameObject("Interior - " + spot.BusinessName);
            root.transform.position = origin;
            BusinessInterior interior = root.AddComponent<BusinessInterior>();
            Material wall = Make(new Color(0.82f, 0.78f, 0.69f));
            Material floor = Make(new Color(0.36f, 0.34f, 0.30f));
            Material accent = Make(new Color(0.18f, 0.38f, 0.52f));
            Material furniture = Make(new Color(0.42f, 0.25f, 0.13f));

            Cube(root.transform, "Floor", new Vector3(0, -0.12f, 0), new Vector3(12, 0.25f, 10), floor);
            Cube(root.transform, "Back wall", new Vector3(0, 2.2f, 5), new Vector3(12, 4.4f, 0.25f), wall);
            Cube(root.transform, "Left wall", new Vector3(-6, 2.2f, 0), new Vector3(0.25f, 4.4f, 10), wall);
            Cube(root.transform, "Right wall", new Vector3(6, 2.2f, 0), new Vector3(0.25f, 4.4f, 10), wall);
            Cube(root.transform, "Front wall left", new Vector3(-4.3f, 2.2f, -5), new Vector3(3.4f, 4.4f, 0.25f), wall);
            Cube(root.transform, "Front wall right", new Vector3(4.3f, 2.2f, -5), new Vector3(3.4f, 4.4f, 0.25f), wall);
            Cube(root.transform, "Store counter", new Vector3(0, 0.55f, 1.5f), new Vector3(4.2f, 1.1f, 1), furniture);
            Cube(root.transform, "Display shelf", new Vector3(-4.5f, 1.1f, 1), new Vector3(0.8f, 2.2f, 3.4f), accent);
            Cube(root.transform, "Display shelf 2", new Vector3(4.5f, 1.1f, 1), new Vector3(0.8f, 2.2f, 3.4f), accent);
            Cube(root.transform, "Interior sign", new Vector3(0, 3.45f, 4.72f), new Vector3(5.5f, 0.65f, 0.18f), accent);
            return interior;
        }

        private static GameObject Cube(Transform root, string name, Vector3 position, Vector3 scale, Material material)
        {
            GameObject item = GameObject.CreatePrimitive(PrimitiveType.Cube);
            item.name = name;
            item.transform.SetParent(root, false);
            item.transform.localPosition = position;
            item.transform.localScale = scale;
            item.GetComponent<Renderer>().sharedMaterial = material;
            return item;
        }

        private static Material Make(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            Material material = new Material(shader);
            material.color = color;
            return material;
        }
    }
}
