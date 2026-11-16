using UnityEngine;
using Citygame.Business;

namespace Citygame.World
{
    public static class LagosBlockGenerator
    {
        public static void Build(Transform root)
        {
            ConfigureTropicalSky();
            Material road = MaterialFor(new Color(0.16f, 0.17f, 0.18f));
            Material concrete = MaterialFor(new Color(0.68f, 0.62f, 0.50f));
            Material paint = MaterialFor(new Color(0.85f, 0.42f, 0.12f));
            Material green = MaterialFor(new Color(0.22f, 0.48f, 0.25f));

            CreateCube("Main Road", root, new Vector3(0, -0.08f, 0), new Vector3(90, 0.12f, 12), road);
            CreateCube("Market Street", root, new Vector3(0, -0.07f, 18), new Vector3(90, 0.12f, 9), road);
            // Two north-south connectors turn the block into a small connected
            // street grid, linking the market, main road and southern storefronts.
            CreateCube("Balogun Connector Street", root, new Vector3(-34f, -0.07f, 0f), new Vector3(9f, 0.12f, 54f), road);
            CreateCube("Adeniran Connector Street", root, new Vector3(34f, -0.07f, 0f), new Vector3(9f, 0.12f, 54f), road);
            CreateCube("South District Street", root, new Vector3(0f, -0.07f, -18f), new Vector3(90f, 0.12f, 9f), road);
            Material laneYellow = MaterialFor(new Color(0.96f, 0.72f, 0.12f));
            Material laneWhite = MaterialFor(new Color(0.88f, 0.88f, 0.82f));
            // Pale edge markings make the new junctions legible from the driving camera.
            CreateCube("Balogun Connector edge west", root, new Vector3(-38.45f, 0.012f, 0f), new Vector3(0.12f, 0.025f, 54f), laneWhite);
            CreateCube("Balogun Connector edge east", root, new Vector3(-29.55f, 0.012f, 0f), new Vector3(0.12f, 0.025f, 54f), laneWhite);
            CreateCube("Adeniran Connector edge west", root, new Vector3(29.55f, 0.012f, 0f), new Vector3(0.12f, 0.025f, 54f), laneWhite);
            CreateCube("Adeniran Connector edge east", root, new Vector3(38.45f, 0.012f, 0f), new Vector3(0.12f, 0.025f, 54f), laneWhite);
            // Lagos-style double yellow center lines and pale road-edge markings.
            CreateCube("Double yellow center line A", root, new Vector3(0, 0.012f, -0.12f), new Vector3(90, 0.025f, 0.11f), laneYellow);
            CreateCube("Double yellow center line B", root, new Vector3(0, 0.012f, 0.12f), new Vector3(90, 0.025f, 0.11f), laneYellow);
            CreateCube("Road edge line left", root, new Vector3(0, 0.012f, -5.45f), new Vector3(90, 0.025f, 0.12f), laneWhite);
            CreateCube("Road edge line right", root, new Vector3(0, 0.012f, 5.45f), new Vector3(90, 0.025f, 0.12f), laneWhite);
            for (int i = 0; i < 12; i++)
            {
                float x = (i - 5.5f) * 7.2f;
                CreateCube("Market Street dashed lane marking", root, new Vector3(x, 0.01f, 18), new Vector3(3.2f, 0.025f, 0.16f), laneWhite);
            }
            Material sidewalk = MaterialFor(new Color(0.58f, 0.55f, 0.49f));
            Material curb = MaterialFor(new Color(0.76f, 0.72f, 0.64f));
            CreateCube("Main Road sidewalk north", root, new Vector3(0, 0.04f, 7.2f), new Vector3(90, 0.18f, 2.4f), sidewalk);
            CreateCube("Main Road sidewalk south", root, new Vector3(0, 0.04f, -7.2f), new Vector3(90, 0.18f, 2.4f), sidewalk);
            CreateCube("Main Road curb north", root, new Vector3(0, 0.14f, 6.05f), new Vector3(90, 0.22f, 0.18f), curb);
            CreateCube("Main Road curb south", root, new Vector3(0, 0.14f, -6.05f), new Vector3(90, 0.22f, 0.18f), curb);

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

            // Parked vehicles add a usable transport layer to the generated block.
            BuildCar(root, "Lagos Taxi", new Vector3(-25f, 0.65f, -3.2f), paint);
            BuildCar(root, "City Sedan", new Vector3(2f, 0.65f, -3.2f), green);
            BuildCar(root, "Street Shuttle", new Vector3(28f, 0.65f, -3.2f), concrete);

            BuildPedestrians(root);
        }

        private static void BuildCar(Transform root, string name, Vector3 position, Material bodyMaterial)
        {
            // The root collider remains the vehicle collision body. All added
            // details are visual-only so they do not snag the player or road.
            GameObject car = CreateCube(name, root, position, new Vector3(3.7f, 0.72f, 1.82f), bodyMaterial);
            car.AddComponent<Citygame.World.RideableCar>();

            Material glass = MaterialFor(new Color(0.055f, 0.12f, 0.17f));
            Material rubber = MaterialFor(new Color(0.035f, 0.04f, 0.045f));
            Material alloy = MaterialFor(new Color(0.48f, 0.52f, 0.56f));
            Material headlamp = MaterialFor(new Color(0.92f, 0.88f, 0.68f));
            Material tailLamp = MaterialFor(new Color(0.72f, 0.035f, 0.025f));

            GameObject cabin = CreateCube(name + " glazed cabin", root,
                position + new Vector3(-0.12f, 0.62f, 0f),
                new Vector3(1.95f, 0.78f, 1.48f), glass);
            cabin.transform.SetParent(car.transform, true);
            DisableVisualCollider(cabin);

            GameObject roof = CreateCube(name + " roof", root,
                position + new Vector3(-0.12f, 1.03f, 0f),
                new Vector3(1.62f, 0.12f, 1.42f), bodyMaterial);
            roof.transform.SetParent(car.transform, true);
            DisableVisualCollider(roof);

            for (int side = -1; side <= 1; side += 2)
            {
                for (int axle = -1; axle <= 1; axle += 2)
                {
                    GameObject wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    wheel.name = name + (axle > 0 ? " front tyre" : " rear tyre");
                    wheel.transform.SetParent(car.transform, false);
                    wheel.transform.localPosition = new Vector3(axle * 1.12f, -0.18f, side * 0.91f);
                    wheel.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    wheel.transform.localScale = new Vector3(0.68f, 0.16f, 0.68f);
                    wheel.GetComponent<Renderer>().sharedMaterial = rubber;
                    DisableVisualCollider(wheel);

                    GameObject hub = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    hub.name = name + " alloy wheel hub";
                    hub.transform.SetParent(car.transform, false);
                    hub.transform.localPosition = new Vector3(axle * 1.12f, -0.18f, side * 1.075f);
                    hub.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    hub.transform.localScale = new Vector3(0.34f, 0.17f, 0.34f);
                    hub.GetComponent<Renderer>().sharedMaterial = alloy;
                    DisableVisualCollider(hub);
                }
            }

            for (int side = -1; side <= 1; side += 2)
            {
                GameObject front = CreateCube(name + " front headlamp", root,
                    position + new Vector3(1.87f, 0.08f, side * 0.59f),
                    new Vector3(0.06f, 0.22f, 0.42f), headlamp);
                front.transform.SetParent(car.transform, true);
                DisableVisualCollider(front);

                GameObject rear = CreateCube(name + " rear tail lamp", root,
                    position + new Vector3(-1.87f, 0.08f, side * 0.59f),
                    new Vector3(0.06f, 0.22f, 0.42f), tailLamp);
                rear.transform.SetParent(car.transform, true);
                DisableVisualCollider(rear);
            }

            GameObject bumper = CreateCube(name + " front bumper", root,
                position + new Vector3(1.88f, -0.24f, 0f),
                new Vector3(0.16f, 0.16f, 1.72f), alloy);
            bumper.transform.SetParent(car.transform, true);
            DisableVisualCollider(bumper);
        }

        private static void DisableVisualCollider(GameObject visual)
        {
            Collider visualCollider = visual.GetComponent<Collider>();
            if (visualCollider != null) visualCollider.enabled = false;
        }

        private static void BuildPedestrians(Transform root)
        {
            for (int i = 0; i < 8; i++)
            {
                GameObject pedestrian = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                pedestrian.name = "Lagos Sidewalk Pedestrian " + (i + 1);
                pedestrian.transform.SetParent(root, false);
                pedestrian.transform.position = new Vector3(-34f + i * 9f, 0.9f, i % 2 == 0 ? 7.5f : -7.5f);
                pedestrian.transform.localScale = new Vector3(0.65f, 0.9f, 0.65f);
                pedestrian.GetComponent<Renderer>().sharedMaterial = MaterialFor(new Color(
                    Random.Range(0.25f, 0.85f), Random.Range(0.2f, 0.75f), Random.Range(0.2f, 0.8f)));
                SidewalkPedestrian walker = pedestrian.AddComponent<SidewalkPedestrian>();
                walker.Configure(-38f, 38f, i % 2 == 0 ? 7.5f : -7.5f);
            }
        }

        private static void CreateBuilding(Transform root, string name, Vector3 position, Vector3 size, Material material, BusinessCategory category)
        {
            Material glass = MaterialFor(new Color(0.16f, 0.28f, 0.38f));
            Material trim = MaterialFor(new Color(0.78f, 0.72f, 0.62f));
            Material doorMaterial = MaterialFor(new Color(0.12f, 0.10f, 0.08f));
            Material frameMaterial = MaterialFor(new Color(0.34f, 0.30f, 0.24f));

            // Form a building shell with a visible ground-floor entrance instead of
            // a solid cube. The door opening is aligned with the BusinessSpot.
            float groundFloorHeight = Mathf.Min(1.8f, size.y * 0.42f);
            float frontZ = position.z - size.z * 0.5f;
            float sideWidth = Mathf.Max(0.65f, (size.x - 1.6f) * 0.5f);
            float sideCenterOffset = 0.8f + sideWidth * 0.5f;

            CreateCube(name + " upper building mass", root,
                position + Vector3.up * (groundFloorHeight + (size.y - groundFloorHeight) * 0.5f),
                new Vector3(size.x, Mathf.Max(0.2f, size.y - groundFloorHeight), size.z), material);
            CreateCube(name + " ground floor left frontage", root,
                new Vector3(position.x - sideCenterOffset, position.y + groundFloorHeight * 0.5f, frontZ),
                new Vector3(sideWidth, groundFloorHeight, 0.22f), material);
            CreateCube(name + " ground floor right frontage", root,
                new Vector3(position.x + sideCenterOffset, position.y + groundFloorHeight * 0.5f, frontZ),
                new Vector3(sideWidth, groundFloorHeight, 0.22f), material);
            CreateCube(name + " entrance lintel", root,
                new Vector3(position.x, position.y + groundFloorHeight - 0.12f, frontZ),
                new Vector3(1.6f, 0.24f, 0.22f), trim);
            CreateCube(name + " entrance door", root,
                new Vector3(position.x, position.y + groundFloorHeight * 0.48f, frontZ - 0.06f),
                new Vector3(1.15f, groundFloorHeight * 0.88f, 0.08f), doorMaterial);
            CreateCube(name + " door handle", root,
                new Vector3(position.x + 0.42f, position.y + groundFloorHeight * 0.48f, frontZ - 0.12f),
                new Vector3(0.06f, 0.28f, 0.04f), trim);
            CreateCube(name + " storefront glass left", root,
                new Vector3(position.x - size.x * 0.29f, position.y + groundFloorHeight * 0.52f, frontZ - 0.08f),
                new Vector3(size.x * 0.28f, groundFloorHeight * 0.68f, 0.08f), glass);
            CreateCube(name + " storefront glass right", root,
                new Vector3(position.x + size.x * 0.29f, position.y + groundFloorHeight * 0.52f, frontZ - 0.08f),
                new Vector3(size.x * 0.28f, groundFloorHeight * 0.68f, 0.08f), glass);

            // Side and rear shell details add depth and frame upper-storey windows.
            CreateCube(name + " left exterior wall", root,
                new Vector3(position.x - size.x * 0.5f, position.y + size.y * 0.5f, position.z),
                new Vector3(0.22f, size.y, size.z), material);
            CreateCube(name + " right exterior wall", root,
                new Vector3(position.x + size.x * 0.5f, position.y + size.y * 0.5f, position.z),
                new Vector3(0.22f, size.y, size.z), material);
            CreateCube(name + " rear exterior wall", root,
                new Vector3(position.x, position.y + size.y * 0.5f, position.z + size.z * 0.5f),
                new Vector3(size.x, size.y, 0.22f), material);

            int floors = Mathf.Max(1, Mathf.FloorToInt(size.y / 2.1f));
            int windowsPerFloor = Mathf.Max(2, Mathf.FloorToInt(size.x / 2.1f));
            float windowWidth = Mathf.Min(1.05f, size.x / (windowsPerFloor + 1f));
            for (int floor = 0; floor < floors; floor++)
            {
                float windowY = position.y + groundFloorHeight + 0.7f + floor * (size.y / floors);
                for (int window = 0; window < windowsPerFloor; window++)
                {
                    float windowX = position.x - size.x * 0.5f + (window + 1) * (size.x / (windowsPerFloor + 1f));
                    CreateCube(name + " facade upper window", root,
                        new Vector3(windowX, windowY, frontZ - 0.055f),
                        new Vector3(windowWidth, 0.72f, 0.08f), glass);
                }
                if (floor > 0)
                    CreateCube(name + " facade floor trim", root,
                        new Vector3(position.x, position.y + groundFloorHeight + floor * (size.y / floors), frontZ - 0.07f),
                        new Vector3(size.x * 0.96f, 0.09f, 0.1f), trim);
            }

            GameObject spotObject = new GameObject(name + " business interaction point");
            spotObject.transform.SetParent(root, false);
            spotObject.transform.position = new Vector3(position.x, position.y, frontZ - 1.1f);
            BusinessSpot spot = spotObject.AddComponent<BusinessSpot>();
            spot.Configure(name, category);
            CreateCube(name + " sign", root,
                position + new Vector3(0, size.y + 0.45f, frontZ - 0.01f),
                new Vector3(size.x * 0.8f, 0.6f, 0.2f), MaterialFor(new Color(0.12f, 0.16f, 0.2f)));
        }

        // Keep one procedural sky material across scene rebuilds to avoid leaking
        // duplicate skybox materials when the runtime regenerates the city.
        private static Material tropicalSkyMaterial;

        private static void ConfigureTropicalSky()
        {
            if (tropicalSkyMaterial == null)
            {
                Shader skyShader = Shader.Find("Skybox/Procedural");
                if (skyShader == null) return;

                tropicalSkyMaterial = new Material(skyShader);
                tropicalSkyMaterial.name = "Citygame tropical sky";
                if (tropicalSkyMaterial.HasProperty("_AtmosphereThickness")) tropicalSkyMaterial.SetFloat("_AtmosphereThickness", 1.15f);
                if (tropicalSkyMaterial.HasProperty("_SkyTint")) tropicalSkyMaterial.SetColor("_SkyTint", new Color(0.48f, 0.66f, 0.88f));
                if (tropicalSkyMaterial.HasProperty("_GroundColor")) tropicalSkyMaterial.SetColor("_GroundColor", new Color(0.42f, 0.38f, 0.32f));
                if (tropicalSkyMaterial.HasProperty("_Exposure")) tropicalSkyMaterial.SetFloat("_Exposure", 1.12f);
                if (tropicalSkyMaterial.HasProperty("_SunSize")) tropicalSkyMaterial.SetFloat("_SunSize", 0.035f);
            }

            RenderSettings.skybox = tropicalSkyMaterial;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Skybox;
            RenderSettings.ambientIntensity = 1.1f;
            DynamicGI.UpdateEnvironment();
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

        // Reuse materials by color instead of allocating a unique material for every
        // window, curb, tree and prop. This keeps the procedural mobile scene lighter.
        private static readonly System.Collections.Generic.Dictionary<Color, Material> MaterialCache =
            new System.Collections.Generic.Dictionary<Color, Material>();

        private static Material MaterialFor(Color color)
        {
            if (MaterialCache.TryGetValue(color, out Material cached) && cached != null)
                return cached;

            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) return null;

            Material material = new Material(shader);
            material.color = color;
            material.name = "Citygame shared material " + color;
            MaterialCache[color] = material;
            return material;
        }
    }
}
