using UnityEngine;

namespace Citygame.World
{
    /// <summary>Ambient lane traffic with junction yielding and basic vehicle following.</summary>
    [RequireComponent(typeof(Collider))]
    public sealed class TrafficVehicle : MonoBehaviour
    {
        [SerializeField] private float speed = 5.5f;
        private float minX;
        private float maxX;
        private float laneZ;
        private int direction = 1;
        private float currentSpeed;
        private float phaseOffset;

        public void Configure(float left, float right, float z, int travelDirection, float cruiseSpeed)
        {
            minX = left;
            maxX = right;
            laneZ = z;
            direction = travelDirection >= 0 ? 1 : -1;
            speed = Mathf.Max(1f, cruiseSpeed);
            currentSpeed = speed;
            phaseOffset = direction > 0 ? 0f : 8f;
            transform.position = new Vector3(direction > 0 ? minX : maxX, 0.62f, laneZ);
            transform.rotation = Quaternion.Euler(0f, direction > 0 ? 0f : 180f, 0f);
        }

        private void Update()
        {
            Vector3 p = transform.position;
            float targetSpeed = speed;

            // Stop briefly at the marked connector junctions during the red phase.
            float cycle = Mathf.Repeat(Time.time + phaseOffset, 18f);
            bool redSignal = cycle > 10f && cycle < 14f;
            if (redSignal && (Mathf.Abs(p.x - (minX + 8f)) < 3.8f || Mathf.Abs(p.x - (maxX - 8f)) < 3.8f))
                targetSpeed = 0f;

            // Start the sensor beyond this vehicle's front bumper. A ray starting
            // inside the car's own collider is ignored by Unity physics, which
            // previously made the following check unreliable.
            Vector3 forward = direction > 0 ? Vector3.right : Vector3.left;
            Vector3 sensorOrigin = transform.position + forward * 1.9f + Vector3.up * 0.04f;
            const float sensorDistance = 8f;
            if (Physics.Raycast(sensorOrigin, forward, out RaycastHit hit, sensorDistance,
                Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore))
            {
                TrafficVehicle other = hit.collider.GetComponentInParent<TrafficVehicle>();
                if (other != null && other != this && other.direction == direction &&
                    Mathf.Abs(other.laneZ - laneZ) <= 1.2f)
                {
                    const float safeGap = 2.2f;
                    float followSpeed = Mathf.Clamp((hit.distance - safeGap) / 3.5f, 0f, 1f) * speed;
                    targetSpeed = Mathf.Min(targetSpeed, followSpeed);
                }
            }

            currentSpeed = Mathf.MoveTowards(currentSpeed, targetSpeed, (targetSpeed < currentSpeed ? 8f : 2.5f) * Time.deltaTime);
            p.x += direction * currentSpeed * Time.deltaTime;
            if (direction > 0 && p.x > maxX) p.x = minX;
            else if (direction < 0 && p.x < minX) p.x = maxX;
            p.z = laneZ;
            transform.position = p;
        }
    }
}