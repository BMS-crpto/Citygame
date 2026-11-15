using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Citygame.Player;

namespace Citygame.Editor
{
    public static class CitygameProjectSetup
    {
        [MenuItem("Citygame/Create Foundation Scene")]
        public static void CreateFoundationScene()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Greybox Ground";
            floor.transform.localScale = new Vector3(12f, 1f, 12f);

            GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.transform.position = new Vector3(0f, 1.05f, 0f);
            Object.DestroyImmediate(player.GetComponent<CapsuleCollider>());
            CharacterController controller = player.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.38f;
            controller.center = new Vector3(0f, 0f, 0f);
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

            EditorSceneManager.SaveScene(scene, "Assets/Scenes/CitygameFoundation.unity");
            AssetDatabase.SaveAssets();
            Selection.activeGameObject = player;
            Debug.Log("Citygame foundation scene created. Press Play to test the greybox movement.");
        }
    }
}
