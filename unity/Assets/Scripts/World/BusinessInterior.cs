using UnityEngine;
using Citygame.Business;
using System.Collections.Generic;

namespace Citygame.World
{
    /// <summary>Procedural, category-specific storefront interiors with ambient staff and visitors.</summary>
    public sealed class BusinessInterior : MonoBehaviour
    {
        private static readonly Dictionary<Color, Material> Materials = new Dictionary<Color, Material>();

        public static BusinessInterior Create(BusinessSpot spot, Vector3 origin)
        {
            if (spot == null) return null;
            GameObject root = new GameObject("Interior - " + spot.BusinessName);
            root.transform.position = origin;
            BusinessInterior interior = root.AddComponent<BusinessInterior>();
            Material wall = Make(new Color(0.82f, 0.78f, 0.69f));
            Material floor = Make(new Color(0.36f, 0.34f, 0.30f));
            Material accent = Make(new Color(0.18f, 0.38f, 0.52f));
            Material furniture = Make(new Color(0.42f, 0.25f, 0.13f));
            Material glass = Make(new Color(0.22f, 0.42f, 0.52f));

            Cube(root.transform, "Floor", new Vector3(0, -0.12f, 0), new Vector3(12, 0.25f, 10), floor);
            Cube(root.transform, "Back wall", new Vector3(0, 2.2f, 5), new Vector3(12, 4.4f, 0.25f), wall);
            Cube(root.transform, "Left wall", new Vector3(-6, 2.2f, 0), new Vector3(0.25f, 4.4f, 10), wall);
            Cube(root.transform, "Right wall", new Vector3(6, 2.2f, 0), new Vector3(0.25f, 4.4f, 10), wall);
            Cube(root.transform, "Front wall left", new Vector3(-4.3f, 2.2f, -5), new Vector3(3.4f, 4.4f, 0.25f), wall);
            Cube(root.transform, "Front wall right", new Vector3(4.3f, 2.2f, -5), new Vector3(3.4f, 4.4f, 0.25f), wall);
            Cube(root.transform, "Interior sign", new Vector3(0, 3.45f, 4.72f), new Vector3(5.5f, 0.65f, 0.18f), accent);

            int npcCount = 2;
            switch (spot.Category)
            {
                case BusinessCategory.Barbershop:
                    Cube(root.transform, "Barber station counter", new Vector3(-2.2f, 0.55f, 1.1f), new Vector3(2.8f, 1.1f, 0.8f), furniture);
                    Cube(root.transform, "Barber mirror", new Vector3(-2.2f, 2f, 1.55f), new Vector3(1.8f, 1.5f, 0.12f), glass);
                    Cube(root.transform, "Waiting bench", new Vector3(2.8f, 0.35f, -0.5f), new Vector3(2.5f, 0.7f, 0.8f), accent);
                    npcCount = 3; break;
                case BusinessCategory.FashionStore:
                    Cube(root.transform, "Clothing display rack left", new Vector3(-4.4f, 1.2f, 1f), new Vector3(0.7f, 2.4f, 3.5f), accent);
                    Cube(root.transform, "Clothing display rack right", new Vector3(4.4f, 1.2f, 1f), new Vector3(0.7f, 2.4f, 3.5f), accent);
                    Cube(root.transform, "Checkout desk", new Vector3(0, 0.55f, 2.8f), new Vector3(2.4f, 1.1f, 0.8f), furniture);
                    npcCount = 3; break;
                case BusinessCategory.Restaurant:
                    for (int i = 0; i < 3; i++)
                    {
                        float z = -1.5f + i * 2.1f;
                        Cube(root.transform, "Dining table " + (i + 1), new Vector3(0, 0.65f, z), new Vector3(2.2f, 0.12f, 1.2f), furniture);
                        Cube(root.transform, "Kitchen prep counter " + (i + 1), new Vector3(-4.6f, 0.7f, z), new Vector3(1.2f, 1.4f, 1.1f), accent);
                    }
                    npcCount = 4; break;
                case BusinessCategory.Supermarket:
                    for (int i = 0; i < 4; i++)
                        Cube(root.transform, "Grocery aisle shelf " + (i + 1), new Vector3(-3.6f + i * 2.4f, 1.1f, 0.8f), new Vector3(0.8f, 2.2f, 3.8f), accent);
                    Cube(root.transform, "Checkout till", new Vector3(0, 0.55f, -3.3f), new Vector3(3.2f, 1.1f, 0.8f), furniture);
                    npcCount = 5; break;
                case BusinessCategory.Lounge:
                    Cube(root.transform, "Lounge bar counter", new Vector3(0, 0.65f, 2.6f), new Vector3(5f, 1.3f, 0.9f), accent);
                    for (int i = 0; i < 3; i++)
                        Cube(root.transform, "Lounge sofa " + (i + 1), new Vector3(-3.5f + i * 3.5f, 0.4f, -1.7f), new Vector3(2.4f, 0.8f, 1.1f), furniture);
                    npcCount = 4; break;
                case BusinessCategory.CarWash:
                    Cube(root.transform, "Wash bay platform", new Vector3(0, 0.05f, 0.3f), new Vector3(5.5f, 0.12f, 5.2f), glass);
                    Cube(root.transform, "Equipment station", new Vector3(-4.5f, 0.7f, 2.6f), new Vector3(1.2f, 1.4f, 1.4f), furniture);
                    Cube(root.transform, "Service desk", new Vector3(3.8f, 0.55f, 2.6f), new Vector3(1.8f, 1.1f, 0.8f), accent);
                    npcCount = 3; break;
                case BusinessCategory.Pharmacy:
                    Cube(root.transform, "Medicine shelf left", new Vector3(-4.4f, 1.2f, 1f), new Vector3(0.7f, 2.4f, 3.8f), accent);
                    Cube(root.transform, "Medicine shelf right", new Vector3(4.4f, 1.2f, 1f), new Vector3(0.7f, 2.4f, 3.8f), accent);
                    Cube(root.transform, "Pharmacy consultation desk", new Vector3(0, 0.55f, 2.5f), new Vector3(3.2f, 1.1f, 0.8f), furniture);
                    npcCount = 3; break;
                case BusinessCategory.Technology:
                    Cube(root.transform, "Tech display counter", new Vector3(0, 0.55f, 2.5f), new Vector3(4.2f, 1.1f, 0.9f), furniture);
                    for (int i = 0; i < 3; i++)
                        Cube(root.transform, "Device demo podium " + (i + 1), new Vector3(-3f + i * 3f, 0.5f, -1.5f), new Vector3(1.1f, 1f, 1.1f), accent);
                    npcCount = 3; break;
            }

            // A simple mezzanine and climbable stairs give multi-storey shops
            // an upstairs area without adding heavy navigation systems.
            Material stair = Make(new Color(0.48f, 0.43f, 0.36f));
            for (int step = 0; step < 10; step++)
            {
                Cube(root.transform, "Interior staircase step " + (step + 1),
                    new Vector3(-4.65f, 0.11f + step * 0.22f, -3.55f + step * 0.72f),
                    new Vector3(1.25f, 0.22f, 0.76f), stair);
            }
            Cube(root.transform, "Upstairs mezzanine floor", new Vector3(2.4f, 2.35f, 2.8f),
                new Vector3(6.8f, 0.2f, 4.2f), floor);
            Cube(root.transform, "Upstairs mezzanine front rail", new Vector3(2.4f, 2.9f, 0.68f),
                new Vector3(6.8f, 0.1f, 0.1f), accent);
            for (int railPost = 0; railPost < 6; railPost++)
                Cube(root.transform, "Upstairs mezzanine rail post " + railPost,
                    new Vector3(-0.7f + railPost * 1.24f, 2.62f, 0.68f),
                    new Vector3(0.08f, 0.55f, 0.08f), accent);

            // The exit trigger returns the player to the pavement outside this shop.
            BusinessDoorPortal.CreateExit(root.transform, new Vector3(0f, 1f, -4.45f),
                origin + new Vector3(0f, 0f, -7.5f));

            SpawnInteriorNpcs(root.transform, npcCount);
            return interior;
        }

        private static void SpawnInteriorNpcs(Transform root, int count)
        {
            for (int i = 0; i < count; i++)
            {
                GameObject npc = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                npc.name = i == 0 ? "Interior staff NPC" : "Interior customer NPC " + i;
                npc.transform.SetParent(root, false);
                npc.transform.localPosition = new Vector3(-3.5f + (i % 3) * 3.5f, 0.9f, -2.2f + (i / 3) * 2.4f);
                npc.transform.localScale = new Vector3(0.58f, 0.9f, 0.58f);
                npc.GetComponent<Renderer>().sharedMaterial = Make(i == 0 ? new Color(0.18f, 0.34f, 0.58f) : new Color(0.52f, 0.3f, 0.22f));
                npc.AddComponent<InteriorNpc>();
            }
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
            if (Materials.TryGetValue(color, out Material cached) && cached != null) return cached;
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) return null;
            Material material = new Material(shader);
            material.color = color;
            material.name = "Citygame interior shared material " + color;
            Materials[color] = material;
            return material;
        }
    }
}
