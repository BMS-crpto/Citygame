using UnityEngine;

namespace Citygame.World
{
    /// <summary>Interaction marker for a vehicle service and customisation bay.</summary>
    [RequireComponent(typeof(BoxCollider))]
    public sealed class VehicleGarage : MonoBehaviour
    {
        public string GarageName { get; private set; }

        public void Configure(string name, Vector3 size)
        {
            GarageName = string.IsNullOrEmpty(name) ? "Lagos Motor Works" : name;
            BoxCollider zone = GetComponent<BoxCollider>();
            zone.isTrigger = true;
            zone.size = size;
            zone.center = Vector3.up;
        }

        public bool IsNear(Vector3 position, float distance = 5f)
        {
            return Vector3.Distance(transform.position, position) <= distance;
        }
    }
}