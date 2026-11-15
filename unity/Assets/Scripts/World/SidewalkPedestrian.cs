using UnityEngine;

namespace Citygame.World
{
    /// <summary>Lightweight sidewalk pedestrian for the greybox scene (no NavMesh required).</summary>
    public sealed class SidewalkPedestrian : MonoBehaviour
    {
        [SerializeField] private float speed = 1.1f;
        [SerializeField] private float minX = -38f;
        [SerializeField] private float maxX = 38f;
        [SerializeField] private float sidewalkZ = 9.5f;
        private int direction = 1;
        private float phase;

        private void Start()
        {
            phase = Random.Range(0f, 6.28f);
            direction = Random.value > 0.5f ? 1 : -1;
            transform.position = new Vector3(Random.Range(minX, maxX), 0.9f, sidewalkZ);
        }

        private void Update()
        {
            float pace = speed * (0.85f + Mathf.Sin(Time.time + phase) * 0.15f);
            Vector3 step = Vector3.right * direction * pace * Time.deltaTime;
            transform.position += step;
            if (transform.position.x >= maxX) direction = -1;
            if (transform.position.x <= minX) direction = 1;
            transform.rotation = Quaternion.Euler(0f, direction > 0 ? 90f : -90f, 0f);
        }
    }
}
