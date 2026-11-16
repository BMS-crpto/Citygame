using UnityEngine;
using Citygame.Business;

namespace Citygame.World
{
    public static class LagosBlockGenerator
    {
        public static void Build(Transform root)
        {
            Build(root, Vector3.zero, "Central");
        }

        // Build named tiles on a shared road grid so neighbouring districts connect.
        public static void Build(Transform root, Vector3 worldOffset, string districtName)
        {
            if (root == null) return;
            root.position = worldOffset;
            BuildDistrict(root, string.IsNullOrEmpty(districtName) ? "Lagos" : districtName);
        }

        private static void BuildDistrict(Transform root, string districtName)
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

            CreateBuilding(root, districtName + " Ikeja Plaza", new Vector3(-20, 0, 13), new Vector3(9, 9, 8), concrete, BusinessCategory.Technology);
            CreateBuilding(root, districtName + " Lekki Fashion House", new Vector3(-7, 0, 13), new Vector3(8, 5, 8), paint, BusinessCategory.FashionStore);
            CreateBuilding(root, districtName + " Yaba Chop House", new Vector3(7, 0, 13), new Vector3(8, 5, 8), concrete, BusinessCategory.Restaurant);
            CreateBuilding(root, districtName + " Surulere Supermart", new Vector3(20, 0, 13), new Vector3(9, 6, 8), green, BusinessCategory.Supermarket);
            CreateBuilding(root, districtName + " Victoria Island Lounge", new Vector3(-20, 0, -13), new Vector3(9, 7, 8), paint, BusinessCategory.Lounge);
            CreateBuilding(root, districtName + " Agege Barbershop", new Vector3(-7, 0, -13), new Vector3(8, 4.5f, 8), green, BusinessCategory.Barbershop);
            CreateBuilding(root, districtName + " Ojota Car Wash", new Vector3(7, 0, -13), new Vector3(8, 4, 8), concrete, BusinessCategory.CarWash);
            CreateBuilding(root, districtName + " Apapa Pharmacy", new Vector3(20, 0, -13), new Vector3(9, 5, 8), paint, BusinessCategory.Pharmacy);

            for (int i = 0; i < 10; i++)
            {
                float x = -32 + i * 7.2f;
                CreateCube("Street tree trunk", root, new Vector3(x, 1.1f, 7), new Vector3(0.5f, 2.2f, 0.5f), concrete);
                CreateCube("Street tree crown", root, new Vector3(x, 3.1f, 7), new Vector3(2.1f, 2.1f, 2.1f), green);
            }

            // Parked vehicles add a usable transport layer to the generated block.
            BuildCar(root, "Lagos Taxi", new Vector3(-28f, 0.65f, -3.2f), paint, VehicleStyle.Taxi);
            BuildCar(root, "City Sedan", new Vector3(-10f, 0.65f, -3.2f), green, VehicleStyle.Sedan);
            BuildCar(root, "Lagos SUV", new Vector3(8f, 0.65f, -3.2f), concrete, VehicleStyle.Suv);
            BuildCar(root, "Lagos Sports Coupe", new Vector3(26f, 0.65f, -3.2f), paint, VehicleStyle.Sports);
            BuildCar(root, "Lagos City Bus", new Vector3(42f, 0.65f, -3.2f), green, VehicleStyle.Bus);

            BuildGarage(root, concrete, paint);
            BuildAmbientTraffic(root, paint, green);
            BuildStreetLights(root);
            BuildPedestrianCrossings(root);
            BuildPedestrians(root);
        }

        private static void BuildGarage(Transform root, Material wall, Material sign)
        {
            Vector3 centre = new Vector3(0f, 0f, -28f);
            // A recognisable roadside service bay with a wide open vehicle entrance.
            CreateCube("Lagos Motor Works left wall", root, centre + new Vector3(-7.2f, 1.8f, 0f), new Vector3(1f, 3.6f, 9f), wall);
            CreateCube("Lagos Motor Works right wall", root, centre + new Vector3(7.2f, 1.8f, 0f), new Vector3(1f, 3.6f, 9f), wall);
            CreateCube("Lagos Motor Works rear wall", root, centre + new Vector3(0f, 1.8f, 4f), new Vector3(15f, 3.6f, 1f), wall);
            CreateCube("Lagos Motor Works roof", root, centre + new Vector3(0f, 3.8f, 0f), new Vector3(15f, 0.45f, 9f), wall);
            CreateCube("Lagos Motor Works sign", root, centre + new Vector3(0f, 3.15f, -4.65f), new Vector3(8f, 0.65f, 0.2f), sign);
            GameObject servicePoint = new GameObject("Lagos Motor Works service point");
            servicePoint.transform.SetParent(root, false);
            servicePoint.transform.position = centre + root.position + new Vector3(0f, 0f, -5.5f);
            VehicleGarage garage = servicePoint.AddComponent<VehicleGarage>();
            garage.Configure("Lagos Motor Works", new Vector3(18f, 2.8f, 12f));
        }

        private static void BuildAmbientTraffic(Transform root, Material firstPaint, Material secondPaint)
        {
            // Two lightweight cars circulate on the market street, away from
            // parked cars and storefront entrances.
            GameObject eastbound = CreateCube("Market Street traffic eastbound", root,
                new Vector3(-40f, 0.62f, 18.5f), new Vector3(3.5f, 0.72f, 1.65f), firstPaint);
            TrafficVehicle eastDriver = eastbound.AddComponent<TrafficVehicle>();
            eastDriver.Configure(root.position.x - 42f, root.position.x + 42f, root.position.z + 18.5f, 1, 5.5f);
            GameObject westbound = CreateCube("Market Street traffic westbound", root,
                new Vector3(40f, 0.62f, 21.5f), new Vector3(3.5f, 0.72f, 1.65f), secondPaint);
            TrafficVehicle westDriver = westbound.AddComponent<TrafficVehicle>();
            westDriver.Configure(root.position.x - 42f, root.position.x + 42f, root.position.z + 21.5f, -1, 4.8f);
        }

        private static void BuildCar(Transform root, string name, Vector3 position, Material bodyMaterial)
        {
            // The root collider remains the vehicle collision body. All added
            // details are visual-only so they do not snag the player or road.
            BuildCar(root, name, position, bodyMaterial, VehicleStyle.Sedan);
        }

        private enum VehicleStyle { Sedan, Taxi, Suv, Bus, Sports }

        private static void BuildCar(Transform root, string name, Vector3 position, Material bodyMaterial, VehicleStyle style)
        {
            GameObject car = CreateCube(name, root, position, new Vector3(3.7f, 0.72f, 1.82f), bodyMaterial);
            switch (style)
            {
                case VehicleStyle.Suv: car.transform.localScale = new Vector3(1.14f, 1.12f, 1.08f); break;
                case VehicleStyle.Bus: car.transform.localScale = new Vector3(1.55f, 1.42f, 1.25f); break;
                case VehicleStyle.Sports: car.transform.localScale = new Vector3(1.04f, 0.86f, 0.98f); break;
                case VehicleStyle.Taxi: car.transform.localScale = new Vector3(1.02f, 1f, 1.02f); break;
            }
            RideableCar rideable = car.AddComponent<Citygame.World.RideableCar>();

            Material glass = GlassMaterial();
            Material rubber = MaterialFor(new Color(0.035f, 0.04f, 0.045f));
            Material alloy = MaterialFor(new Color(0.48f, 0.52f, 0.56f));
            Material headlamp = MaterialFor(new Color(0.92f, 0.88f, 0.68f));
            Material tailLamp = MaterialFor(new Color(0.72f, 0.035f, 0.025f));

            Material interior = MaterialFor(new Color(0.075f, 0.068f, 0.058f));
            Material seatFabric = MaterialFor(new Color(0.16f, 0.18f, 0.19f));
            Material metal = MaterialFor(new Color(0.28f, 0.31f, 0.33f));
            Material display = MaterialFor(new Color(0.035f, 0.12f, 0.15f));
            if (display != null && display.HasProperty("_EmissionColor"))
            {
                display.EnableKeyword("_EMISSION");
                display.SetColor("_EmissionColor", new Color(0.04f, 0.42f, 0.52f));
            }

            // Open framed cabin: glass panels leave the dashboard and seats visible.
            CreateCarPart(name + " windshield", car.transform, new Vector3(0.78f, 0.79f, 0f), new Vector3(0.07f, 0.62f, 1.34f), glass);
            CreateCarPart(name + " rear window", car.transform, new Vector3(-1.02f, 0.79f, 0f), new Vector3(0.07f, 0.58f, 1.28f), glass);
            for (int side = -1; side <= 1; side += 2)
            {
                CreateCarPart(name + " side window", car.transform, new Vector3(-0.1f, 0.82f, side * 0.72f), new Vector3(1.55f, 0.52f, 0.045f), glass);
                CreateCarPart(name + " cabin pillar", car.transform, new Vector3(-0.1f, 0.83f, side * 0.75f), new Vector3(1.7f, 0.08f, 0.09f), bodyMaterial);
                CreateCarPart(name + " door inner trim", car.transform, new Vector3(-0.08f, 0.28f, side * 0.77f), new Vector3(1.62f, 0.42f, 0.1f), interior);
                CreateCarPart(name + " door armrest", car.transform, new Vector3(-0.05f, 0.49f, side * 0.79f), new Vector3(0.62f, 0.07f, 0.12f), metal);
                CreateCarPart(name + " door handle", car.transform, new Vector3(-0.52f, 0.43f, side * 0.85f), new Vector3(0.2f, 0.045f, 0.035f), alloy);
            }
            CreateCarPart(name + " roof", car.transform, new Vector3(-0.12f, 1.09f, 0f), new Vector3(1.72f, 0.12f, 1.48f), bodyMaterial);
            if (style == VehicleStyle.Taxi)
                CreateCarPart(name + " taxi roof sign", car.transform, new Vector3(0.05f, 1.2f, 0f), new Vector3(0.48f, 0.12f, 0.34f), headlamp);
            // Dashboard, instrument binnacle, digital display and centre console.
            CreateCarPart(name + " dashboard", car.transform, new Vector3(0.62f, 0.48f, 0f), new Vector3(0.38f, 0.28f, 1.42f), interior);
            CreateCarPart(name + " instrument cluster", car.transform, new Vector3(0.79f, 0.67f, -0.39f), new Vector3(0.12f, 0.19f, 0.42f), metal);
            CreateCarPart(name + " instrument display", car.transform, new Vector3(0.855f, 0.68f, -0.39f), new Vector3(0.025f, 0.11f, 0.31f), display);
            CreateCarPart(name + " centre console", car.transform, new Vector3(0.02f, 0.32f, 0f), new Vector3(0.72f, 0.16f, 0.34f), interior);
            CreateCarPart(name + " infotainment screen", car.transform, new Vector3(0.48f, 0.69f, 0.02f), new Vector3(0.035f, 0.2f, 0.34f), display);
            CreateCarPart(name + " gear selector", car.transform, new Vector3(-0.02f, 0.52f, 0.02f), new Vector3(0.13f, 0.28f, 0.13f), metal);
            CreateCarPart(name + " rear view mirror", car.transform, new Vector3(0.63f, 1.0f, 0f), new Vector3(0.08f, 0.07f, 0.34f), metal);
            // Driver and passenger seats, plus rear bench and headrests.
            for (int side = -1; side <= 1; side += 2)
            {
                float seatZ = side * 0.39f;
                CreateCarPart(name + " front seat cushion", car.transform, new Vector3(-0.34f, 0.26f, seatZ), new Vector3(0.62f, 0.18f, 0.5f), seatFabric);
                CreateCarPart(name + " front seat back", car.transform, new Vector3(-0.72f, 0.56f, seatZ), new Vector3(0.18f, 0.64f, 0.5f), seatFabric);
                CreateCarPart(name + " front headrest", car.transform, new Vector3(-0.78f, 0.94f, seatZ), new Vector3(0.2f, 0.2f, 0.34f), seatFabric);
                CreateCarPart(name + " rear seat cushion", car.transform, new Vector3(-0.98f, 0.25f, seatZ * 0.85f), new Vector3(0.38f, 0.16f, 0.54f), seatFabric);
            }
            CreateCarPart(name + " steering column", car.transform, new Vector3(0.54f, 0.58f, -0.39f), new Vector3(0.22f, 0.12f, 0.12f), metal);
            GameObject steeringWheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            steeringWheel.name = name + " steering wheel";
            steeringWheel.transform.SetParent(car.transform, false);
            steeringWheel.transform.localPosition = new Vector3(0.67f, 0.72f, -0.39f);
            steeringWheel.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
            steeringWheel.transform.localScale = new Vector3(0.43f, 0.035f, 0.43f);
            steeringWheel.GetComponent<Renderer>().sharedMaterial = interior;
            DisableVisualCollider(steeringWheel);
            GameObject speedTextObject = new GameObject(name + " digital speedometer text");
            speedTextObject.transform.SetParent(car.transform, false);
            speedTextObject.transform.localPosition = new Vector3(0.88f, 0.69f, -0.39f);
            speedTextObject.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
            TextMesh speedText = speedTextObject.AddComponent<TextMesh>();
            speedText.text = "000 km/h";
            speedText.fontSize = 48;
            speedText.characterSize = 0.018f;
            speedText.anchor = TextAnchor.MiddleCenter;
            speedText.color = new Color(0.2f, 0.9f, 1f);

            CreateCarPart(name + " left side mirror", car.transform, new Vector3(0.55f, 0.77f, -0.94f), new Vector3(0.25f, 0.16f, 0.18f), metal);
            CreateCarPart(name + " right side mirror", car.transform, new Vector3(0.55f, 0.77f, 0.94f), new Vector3(0.25f, 0.16f, 0.18f), metal);
            CreateCarPart(name + " footwell", car.transform, new Vector3(0.35f, 0.08f, -0.38f), new Vector3(0.45f, 0.08f, 0.42f), interior);

            GameObject cockpitAnchor = new GameObject(name + " cockpit camera anchor");
            cockpitAnchor.transform.SetParent(car.transform, false);
            cockpitAnchor.transform.localPosition = new Vector3(0.52f, 0.92f, -0.05f);
            cockpitAnchor.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
            rideable.ConfigureCockpit(cockpitAnchor.transform);
            Light[] headlamps = new Light[2];
            for (int lampIndex = 0; lampIndex < 2; lampIndex++)
            {
                GameObject lampObject = new GameObject(name + " functional headlight " + (lampIndex + 1));
                lampObject.transform.SetParent(car.transform, false);
                lampObject.transform.localPosition = new Vector3(1.82f, 0.12f, lampIndex == 0 ? -0.48f : 0.48f);
                lampObject.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
                Light lamp = lampObject.AddComponent<Light>();
                lamp.type = LightType.Spot;
                lamp.range = 24f;
                lamp.spotAngle = 52f;
                lamp.intensity = 2.1f;
                lamp.shadows = LightShadows.None;
                lamp.enabled = false;
                headlamps[lampIndex] = lamp;
            }
            rideable.ConfigureHeadlights(headlamps);

            Transform[] wheelVisuals = new Transform[4];
            Transform[] suspensionPivots = new Transform[4];
            int wheelIndex = 0;
            for (int side = -1; side <= 1; side += 2)
            {
                for (int axle = -1; axle <= 1; axle += 2)
                {
                    GameObject suspension = new GameObject(name + " suspension pivot");
                    suspension.transform.SetParent(car.transform, false);
                    suspension.transform.localPosition = new Vector3(axle * 1.12f, -0.18f, side * 0.91f);
                    suspensionPivots[wheelIndex] = suspension.transform;
                    GameObject wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    wheel.name = name + (axle > 0 ? " front tyre" : " rear tyre");
                    wheel.transform.SetParent(suspension.transform, false);
                    wheel.transform.localPosition = Vector3.zero;
                    wheel.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    wheel.transform.localScale = new Vector3(0.68f, 0.16f, 0.68f);
                    wheel.GetComponent<Renderer>().sharedMaterial = rubber;
                    DisableVisualCollider(wheel);
                    wheelVisuals[wheelIndex++] = wheel.transform;

                    GameObject hub = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    hub.name = name + " alloy wheel hub";
                    hub.transform.SetParent(suspension.transform, false);
                    hub.transform.localPosition = new Vector3(0f, 0f, side * 0.165f);
                    hub.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    hub.transform.localScale = new Vector3(0.34f, 0.17f, 0.34f);
                    hub.GetComponent<Renderer>().sharedMaterial = alloy;
                    DisableVisualCollider(hub);
                }
            }

            rideable.ConfigureDrivingVisuals(steeringWheel.transform, wheelVisuals, speedText, suspensionPivots);

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

        private static GameObject CreateCarPart(string name, Transform parent, Vector3 localPosition, Vector3 localScale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            DisableVisualCollider(part);
            return part;
        }

        private static Material GlassMaterial()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) return MaterialFor(new Color(0.055f, 0.12f, 0.17f));

            Material material = new Material(shader);
            material.name = "Citygame vehicle glass";
            Color tint = new Color(0.16f, 0.28f, 0.34f, 0.28f);
            material.color = tint;
            if (material.HasProperty("_Surface"))
            {
                material.SetFloat("_Surface", 1f);
                material.SetFloat("_Blend", 0f);
                material.SetFloat("_ZWrite", 0f);
                material.renderQueue = 3000;
            }
            else if (material.HasProperty("_Mode"))
            {
                material.SetFloat("_Mode", 3f);
                material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.One);
                material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                material.SetInt("_ZWrite", 0);
                material.DisableKeyword("_ALPHATEST_ON");
                material.EnableKeyword("_ALPHABLEND_ON");
                material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                material.renderQueue = 3000;
            }
            return material;
        }

        private static void DisableVisualCollider(GameObject visual)
        {
            Collider visualCollider = visual.GetComponent<Collider>();
            if (visualCollider != null) visualCollider.enabled = false;
        }

        private static void BuildPedestrianCrossings(Transform root)
        {
            Material paint = MaterialFor(new Color(0.91f, 0.90f, 0.84f));
            // Zebra crossings at the three junctions on each connector.
            float[] connectorX = { -34f, 34f };
            float[] junctionZ = { -18f, 0f, 18f };
            foreach (float x in connectorX)
            {
                foreach (float z in junctionZ)
                {
                    for (int stripe = 0; stripe < 7; stripe++)
                    {
                        float stripeZ = z - 3.0f + stripe * 1.0f;
                        CreateCube("Zebra crossing stripe", root,
                            new Vector3(x, 0.025f, stripeZ),
                            new Vector3(7.2f, 0.035f, 0.42f), paint);
                    }
                }
            }
            // A short crossing on the main avenue near the market entrance.
            for (int stripe = 0; stripe < 7; stripe++)
            {
                float stripeX = -4.2f + stripe * 1.0f;
                CreateCube("Market entrance zebra crossing stripe", root,
                    new Vector3(stripeX, 0.026f, 5.0f),
                    new Vector3(0.42f, 0.035f, 2.2f), paint);
            }
        }

        private static void BuildStreetLights(Transform root)
        {
            Material poleMaterial = MaterialFor(new Color(0.16f, 0.18f, 0.20f));
            Material lampMaterial = MaterialFor(new Color(0.92f, 0.82f, 0.58f));
            // Static emissive-looking lamp heads provide street detail without
            // adding dozens of expensive real-time lights on mobile.
            for (int i = 0; i < 8; i++)
            {
                float x = -31.5f + i * 9f;
                for (int side = -1; side <= 1; side += 2)
                {
                    float z = side * 8.1f;
                    CreateCube("Lagos streetlight pole", root,
                        new Vector3(x, 2.6f, z), new Vector3(0.16f, 5.2f, 0.16f), poleMaterial);
                    CreateCube("Lagos streetlight arm", root,
                        new Vector3(x + 0.55f, 5.05f, z), new Vector3(1.2f, 0.12f, 0.14f), poleMaterial);
                    CreateCube("Lagos streetlight lamp", root,
                        new Vector3(x + 1.08f, 4.96f, z), new Vector3(0.42f, 0.16f, 0.32f), lampMaterial);
                }
            }
        }

        private static void BuildPedestrians(Transform root)
        {
            for (int i = 0; i < 8; i++)
            {
                GameObject pedestrian = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                pedestrian.name = "Lagos Sidewalk Pedestrian " + (i + 1);
                pedestrian.transform.SetParent(root, false);
                pedestrian.transform.position = new Vector3(-34f + i * 9f, 0.9f, i % 2 == 0 ? 7.5f : -7.5f) + root.position;
                pedestrian.transform.localScale = new Vector3(0.65f, 0.9f, 0.65f);
                pedestrian.GetComponent<Renderer>().sharedMaterial = MaterialFor(new Color(
                    Random.Range(0.25f, 0.85f), Random.Range(0.2f, 0.75f), Random.Range(0.2f, 0.8f)));
                SidewalkPedestrian walker = pedestrian.AddComponent<SidewalkPedestrian>();
                walker.Configure(root.position.x - 38f, root.position.x + 38f, root.position.z + (i % 2 == 0 ? 7.5f : -7.5f));
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
            GameObject entranceDoor = CreateCube(name + " entrance door", root,
                new Vector3(position.x, position.y + groundFloorHeight * 0.48f, frontZ - 0.06f),
                new Vector3(1.15f, groundFloorHeight * 0.88f, 0.08f), doorMaterial);
            // The door is a visual panel: the portal handles entry, so a solid
            // cube collider here would block the player before the trigger fires.
            DisableVisualCollider(entranceDoor);
            GameObject doorHandle = CreateCube(name + " door handle", root,
                new Vector3(position.x + 0.42f, position.y + groundFloorHeight * 0.48f, frontZ - 0.12f),
                new Vector3(0.06f, 0.28f, 0.04f), trim);
            DisableVisualCollider(doorHandle);
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
            spotObject.transform.position = new Vector3(position.x, position.y, frontZ - 1.1f) + root.position;
            BusinessSpot spot = spotObject.AddComponent<BusinessSpot>();
            spot.Configure(name, category);
            BusinessDoorPortal doorway = spotObject.AddComponent<BusinessDoorPortal>();
            doorway.ConfigureEntry(name, category, position);
            Material signMaterial = MaterialFor(new Color(0.12f, 0.16f, 0.2f));
            CreateCube(name + " signboard", root,
                position + new Vector3(0, size.y + 0.45f, frontZ - 0.01f),
                new Vector3(size.x * 0.8f, 0.6f, 0.2f), signMaterial);
            CreateCube(name + " signboard top trim", root,
                position + new Vector3(0, size.y + 0.78f, frontZ - 0.02f),
                new Vector3(size.x * 0.82f, 0.07f, 0.24f), trim);

            // Ground-floor shop awning and slim supports make storefronts read
            // as distinct Lagos businesses from the street camera.
            Material awning = MaterialFor(new Color(0.72f, 0.24f, 0.10f));
            CreateCube(name + " storefront awning", root,
                new Vector3(position.x, position.y + groundFloorHeight + 0.12f, frontZ - 0.62f),
                new Vector3(size.x * 0.92f, 0.16f, 1.25f), awning);
            for (int side = -1; side <= 1; side += 2)
            {
                CreateCube(name + " awning support", root,
                    new Vector3(position.x + side * (size.x * 0.43f), position.y + groundFloorHeight * 0.5f, frontZ - 1.12f),
                    new Vector3(0.09f, groundFloorHeight, 0.09f), trim);
            }

            // Narrow upper-floor balcony ledges with rails add depth without
            // requiring expensive transparent materials or extra lighting.
            if (size.y >= 5f)
            {
                float balconyY = position.y + groundFloorHeight + 0.18f;
                CreateCube(name + " balcony floor", root,
                    new Vector3(position.x, balconyY, frontZ - 0.42f),
                    new Vector3(size.x * 0.76f, 0.14f, 0.9f), trim);
                CreateCube(name + " balcony front rail", root,
                    new Vector3(position.x, balconyY + 0.52f, frontZ - 0.82f),
                    new Vector3(size.x * 0.76f, 0.08f, 0.08f), frameMaterial);
                for (int rail = -1; rail <= 1; rail++)
                {
                    CreateCube(name + " balcony rail post", root,
                        new Vector3(position.x + rail * size.x * 0.25f, balconyY + 0.28f, frontZ - 0.82f),
                        new Vector3(0.07f, 0.55f, 0.07f), frameMaterial);
                }
            }
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
            obj.transform.position = position + root.position;
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
