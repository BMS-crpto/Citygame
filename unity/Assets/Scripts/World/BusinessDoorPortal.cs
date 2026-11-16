using UnityEngine;
using Citygame.Business;

namespace Citygame.World
{
    /// <summary>Loads a business interior when the player reaches its doorway.</summary>
    public sealed class BusinessDoorPortal : MonoBehaviour
    {
        private string businessName;
        private BusinessCategory category;
        private Vector3 interiorOrigin;
        private bool isExit;
        private Vector3 destination;
        private bool occupied;

        public void ConfigureEntry(string name, BusinessCategory type, Vector3 origin)
        {
            businessName = name;
            category = type;
            interiorOrigin = origin;
            SphereCollider trigger = gameObject.AddComponent<SphereCollider>();
            trigger.isTrigger = true;
            trigger.radius = 2.25f;
            trigger.center = Vector3.up;
        }

        public static void CreateExit(Transform parent, Vector3 localPosition, Vector3 outsidePosition)
        {
            GameObject exit = new GameObject("Business exit portal");
            exit.transform.SetParent(parent, false);
            exit.transform.localPosition = localPosition;
            BusinessDoorPortal portal = exit.AddComponent<BusinessDoorPortal>();
            portal.isExit = true;
            portal.destination = outsidePosition;
            SphereCollider trigger = exit.AddComponent<SphereCollider>();
            trigger.isTrigger = true;
            trigger.radius = 0.8f;
        }

        private void OnTriggerEnter(Collider other)
        {
            CharacterController controller = other.GetComponent<CharacterController>();
            if (controller == null) controller = other.GetComponentInParent<CharacterController>();
            if (controller == null || occupied) return;
            occupied = true;

            if (!isExit)
            {
                BusinessInterior.Create(GetSpot(), interiorOrigin);
                MovePlayer(controller, interiorOrigin + new Vector3(0f, 1f, -3.35f));
            }
            else
            {
                MovePlayer(controller, destination + Vector3.up);
            }
        }

        private BusinessSpot GetSpot()
        {
            BusinessSpot spot = GetComponent<BusinessSpot>();
            if (spot == null)
            {
                spot = gameObject.AddComponent<BusinessSpot>();
                spot.Configure(businessName, category);
            }
            return spot;
        }

        private static void MovePlayer(CharacterController controller, Vector3 position)
        {
            controller.enabled = false;
            controller.transform.position = position;
            controller.enabled = true;
            Physics.SyncTransforms();
        }

        private void OnTriggerExit(Collider other)
        {
            CharacterController controller = other.GetComponent<CharacterController>();
            if (controller == null) controller = other.GetComponentInParent<CharacterController>();
            if (controller != null) occupied = false;
        }
    }
}