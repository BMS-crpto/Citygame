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

            // Follow traffic ahead instead of driving through another vehicle.
            Vector3 forward = direction > 0 ? Vector3.right : Vector3.left;
            RaycastHit[] hits = Physics.RaycastAll(transform.position + Vector3.up * 0.2f, forward, 6f,
                Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore);
            float nearest = float.MaxValue;
            for (int i = 0; i < hits.Length; i++)
            {
                TrafficVehicle other = hits[i].collider.GetComponentInParent<TrafficVehicle>();
                if (other == null || other == this || other.direction != direction) continue;
                if (Mathf.Abs(other.laneZ - laneZ) > 1.2f) continue;
                if (hits[i].distance < nearest) nearest = hits[i].distance;
            }
            if (nearest < 5f) targetSpeed = Mathf.Min(targetSpeed, Mathf.Max(0f, (nearest - 2f) * speed / 3f));

            currentSpeed = Mathf.MoveTowards(currentSpeed, targetSpeed, (targetSpeed < currentSpeed ? 8f : 2.5f) * Time.deltaTime);
            p.x += direction * currentSpeed * Time.deltaTime;
            if (direction > 0 && p.x > maxX) p.x = minX;
            else if (direction < 0 && p.x < minX) p.x = maxX;
            p.z = laneZ;
            transform.position = p;
        }
    }
}