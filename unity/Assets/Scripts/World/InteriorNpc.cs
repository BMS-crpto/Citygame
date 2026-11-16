using UnityEngine;

namespace Citygame.World
{
    /// <summary>Small ambient indoor NPC movement contained within a generated shop.</summary>
    public sealed class InteriorNpc : MonoBehaviour
    {
        [SerializeField, Min(0f)] private float moveSpeed = 0.45f;
        [SerializeField] private Vector2 roomXBounds = new Vector2(-4.8f, 4.8f);
        [SerializeField] private Vector2 roomZBounds = new Vector2(-3.8f, 3.8f);
        private Vector3 destination;
        private float pauseClock;

        private void Start()
        {
            ChooseDestination();
        }

        private void Update()
        {
            if (pauseClock > 0f)
            {
                pauseClock -= Time.deltaTime;
                return;
            }

            Vector3 position = transform.localPosition;
            Vector3 target = new Vector3(destination.x, position.y, destination.z);
            position = Vector3.MoveTowards(position, target, moveSpeed * Time.deltaTime);
            position.x = Mathf.Clamp(position.x, roomXBounds.x, roomXBounds.y);
            position.z = Mathf.Clamp(position.z, roomZBounds.x, roomZBounds.y);
            transform.localPosition = position;

            Vector3 direction = target - position;
            if (direction.sqrMagnitude > 0.01f)
                transform.rotation = Quaternion.LookRotation(direction.normalized, Vector3.up);

            if (Vector3.Distance(position, target) < 0.15f)
            {
                pauseClock = Random.Range(1.2f, 3.8f);
                ChooseDestination();
            }
        }

        private void ChooseDestination()
        {
            destination = new Vector3(
                Random.Range(roomXBounds.x, roomXBounds.y),
                transform.localPosition.y,
                Random.Range(roomZBounds.x, roomZBounds.y));
        }
    }
}
