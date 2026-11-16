using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Citygame.Player;
using Citygame.Game;
using Citygame.World;

namespace Citygame.Editor
{
    public static class CitygameProjectSetup
    {
        [MenuItem("Citygame/Create Foundation Scene")]
        public static void CreateFoundationScene()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Lagos Greybox Ground";
            floor.transform.localScale = new Vector3(40f, 1f, 40f);
            // Build a connected 3x3 Lagos region on a shared road grid.
            string[] districtNames = { "Ikeja", "Yaba", "Surulere", "Agege", "Central Lagos", "Lekki", "Ojota", "Victoria Island", "Apapa" };
            int districtIndex = 0;
            for (int z = -1; z <= 1; z++)
            {
                for (int x = -1; x <= 1; x++)
                {
                    GameObject districtRoot = new GameObject(districtNames[districtIndex] + " District");
                    LagosBlockGenerator.Build(districtRoot.transform, new Vector3(x * 68f, 0f, z * 54f), districtNames[districtIndex]);
                    districtIndex++;
                }
            }

            GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.transform.position = new Vector3(0f, 1.05f, 0f);
            Object.DestroyImmediate(player.GetComponent<CapsuleCollider>());
            CharacterController controller = player.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.38f;
            controller.center = Vector3.zero;
            player.AddComponent<ThirdPersonMotor>();

            GameObject cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 60f;
            cameraObject.AddComponent<AudioListener>();
            FollowCamera follow = cameraObject.AddComponent<FollowCamera>();
            follow.SetTarget(player.transform);
            player.GetComponent<ThirdPersonMotor>().SetCamera(cameraObject.transform);

            GameObject lightObject = new GameObject("Directional Light");
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            DayNightCycle cycle = lightObject.AddComponent<DayNightCycle>();
            SerializedObject cycleData = new SerializedObject(cycle);
            cycleData.FindProperty("sun").objectReferenceValue = light;
            cycleData.ApplyModifiedPropertiesWithoutUndo();

            GameObject gameSystems = new GameObject("Citygame Runtime Systems");
            gameSystems.AddComponent<CitygameRuntime>();
            gameSystems.AddComponent<CitygameMobileGraphics>();
            gameSystems.AddComponent<LagosWeatherSystem>();
            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/CitygameFoundation.unity");
            AssetDatabase.SaveAssets();
            Selection.activeGameObject = player;
            Debug.Log("Citygame scene generated with touch controls, business systems, local save and dynamic day/night lighting.");
        }
    }
}