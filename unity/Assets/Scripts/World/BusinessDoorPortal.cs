using UnityEngine;
using Citygame.Business;
using Citygame.Game;

namespace Citygame.World
{
    /// <summary>Loads a business interior when the player reaches its doorway.</summary>
    public sealed class BusinessDoorPortal : MonoBehaviour
    {
        private string businessName;
        private BusinessCategory category;
        private Vector3 interiorOrigin;
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

        private void OnTriggerEnter(Collider other)
        {
            CharacterController controller = other.GetComponent<CharacterController>();
            if (controller == null) controller = other.GetComponentInParent<CharacterController>();
            if (controller == null || occupied) return;
            CitygameRuntime runtime = FindObjectOfType<CitygameRuntime>();
            if (runtime == null) return;
            BusinessSpot spot = GetSpot();
            runtime.EnterInterior(spot);
            occupied = true;
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

        private void OnTriggerExit(Collider other)
        {
            CharacterController controller = other.GetComponent<CharacterController>();
            if (controller == null) controller = other.GetComponentInParent<CharacterController>();
            if (controller != null) occupied = false;
        }
    }
}