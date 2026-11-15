using UnityEngine;
using Citygame.Business;

namespace Citygame.World
{
    public static class LagosBlockGenerator
    {
        public static void Build(Transform root)
        {
            Material road = MaterialFor(new Color(0.16f, 0.17f, 0.18f));
            Material concrete = MaterialFor(new Color(0.68f, 0.62f, 0.50f));
            Material paint = MaterialFor(new Color(0.85f, 0.42f, 0.12f));
            Material green = MaterialFor(new Color(0.22f, 0.48f, 0.25f));

            CreateCube("Main Road", root, new Vector3(0, -0.08f, 0), new Vector3(90, 0.12f, 12), road);
            CreateCube("Market Street", root, new Vector3(0, -0.07f, 18), new Vector3(90, 0.12f, 9), road);

            for (int i = 0; i < 12; i++)
            {
                float x = (i - 5.5f) * 7.2f;
                CreateCube("Road lane marking", root, new Vector3(x, 0.01f, 0), new Vector3(3.2f, 0.025f, 0.18f), MaterialFor(Color.white));
            }

            CreateBuilding(root, "Ikeja Plaza", new Vector3(-20, 0, 13), new Vector3(9, 9, 8), concrete, BusinessCategory.Technology);
            CreateBuilding(root, "Lekki Fashion House", new Vector3(-7, 0, 13), new Vector3(8, 5, 8), paint, BusinessCategory.FashionStore);
            CreateBuilding(root, "Yaba Chop House", new Vector3(7, 0, 13), new Vector3(8, 5, 8), concrete, BusinessCategory.Restaurant);
            CreateBuilding(root, "Surulere Supermart", new Vector3(20, 0, 13), new Vector3(9, 6, 8), green, BusinessCategory.Supermarket);
            CreateBuilding(root, "Victoria Island Lounge", new Vector3(-20, 0, -13), new Vector3(9, 7, 8), paint, BusinessCategory.Lounge);
            CreateBuilding(root, "Agege Barbershop", new Vector3(-7, 0, -13), new Vector3(8, 4.5f, 8), green, BusinessCategory.Barbershop);
            CreateBuilding(root, "Ojota Car Wash", new Vector3(7, 0, -13), new Vector3(8, 4, 8), concrete, BusinessCategory.CarWash);
            CreateBuilding(root, "Apapa Pharmacy", new Vector3(20, 0, -13), new Vector3(9, 5, 8), paint, BusinessCategory.Pharmacy);

            for (int i = 0; i < 10; i++)
            {
                float x = -32 + i * 7.2f;
                CreateCube("Street tree trunk", root, new Vector3(x, 1.1f, 7), new Vector3(0.5f, 2.2f, 0.5f), concrete);
                CreateCube("Street tree crown", root, new Vector3(x, 3.1f, 7), new Vector3(2.1f, 2.1f, 2.1f), green);
            }
        }

        private static void CreateBuilding(Transform root, string name, Vector3 position, Vector3 size, Material material, BusinessCategory category)
        {
            GameObject building = CreateCube(name, root, position + Vector3.up * size.y * 0.5f, size, material);
            BusinessSpot spot = building.AddComponent<BusinessSpot>();
            spot.Configure(name, category);
            CreateCube(name + " sign", root, position + new Vector3(0, size.y + 0.45f, -size.z * 0.51f), new Vector3(size.x * 0.8f, 0.6f, 0.2f), MaterialFor(new Color(0.12f, 0.16f, 0.2f)));
        }

        private static GameObject CreateCube(string name, Transform root, Vector3 position, Vector3 scale, Material material)
        {
            GameObject obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
            obj.name = name;
            obj.transform.SetParent(root, false);
            obj.transform.position = position;
            obj.transform.localScale = scale;
            obj.GetComponent<Renderer>().sharedMaterial = material;
            return obj;
        }

        private static Material MaterialFor(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            Material material = new Material(shader);
            material.color = color;
            return material;
        }
    }
}
