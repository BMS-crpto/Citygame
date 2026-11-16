using UnityEngine;

namespace Citygame.World
{
    public sealed class PetrolStation : MonoBehaviour
    {
        [SerializeField] private string stationName = "Lagos Fuel Station";
        [SerializeField] private float interactionRadius = 9f;

        public string StationName => stationName;
        public float InteractionRadius => interactionRadius;

        public void Configure(string displayName, float radius)
        {
            stationName = string.IsNullOrEmpty(displayName) ? "Lagos Fuel Station" : displayName;
            interactionRadius = Mathf.Clamp(radius, 3f, 20f);
        }
    }
}
