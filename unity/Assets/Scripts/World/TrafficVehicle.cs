using UnityEngine;

namespace Citygame.World
{
    /// <summary>Simple ambient traffic that follows a district road lane.</summary>
    public sealed class TrafficVehicle : MonoBehaviour
    {
        [SerializeField] private float speed = 5.5f;
        private float minX;
        private float maxX;
        private float laneZ;
        private int direction = 1;

        public void Configure(float left, float right, float z, int travelDirection, float cruiseSpeed)
        {
            minX = left;
            maxX = right;
            laneZ = z;
            direction = travelDirection >= 0 ? 1 : -1;
            speed = Mathf.Max(1f, cruiseSpeed);
            transform.position = new Vector3(direction > 0 ? minX : maxX, 0.62f, laneZ);
            transform.rotation = Quaternion.Euler(0f, direction > 0 ? 90f : -90f, 0f);
        }

        private void Update()
        {
            Vector3 p = transform.position;
            p.x += direction * speed * Time.deltaTime;
            if (direction > 0 && p.x > maxX) p.x = minX;
            else if (direction < 0 && p.x < minX) p.x = maxX;
            p.z = laneZ;
            transform.position = p;
        }
    }
}