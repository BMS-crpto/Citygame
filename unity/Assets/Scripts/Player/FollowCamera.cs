using UnityEngine;

namespace Citygame.Player
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 offset = new Vector3(0f, 4.2f, -6.5f);
        [SerializeField, Min(0.1f)] private float followSharpness = 8f;
        [SerializeField, Range(15f, 80f)] private float pitch = 24f;
        [SerializeField, Min(0.05f)] private float collisionRadius = 0.22f;
        [SerializeField, Min(0.2f)] private float minimumDistance = 1.1f;
        [SerializeField] private LayerMask collisionMask = ~0;

        private void LateUpdate()
        {
            if (target == null) return;

            Quaternion rotation = Quaternion.Euler(pitch, target.eulerAngles.y, 0f);
            Vector3 focus = target.position + Vector3.up * 1.4f;
            Vector3 desiredPosition = focus + rotation * offset;
            Vector3 direction = desiredPosition - focus;
            float desiredDistance = direction.magnitude;
            if (desiredDistance > 0.001f && Physics.SphereCast(focus, collisionRadius, direction.normalized,
                out RaycastHit hit, desiredDistance, collisionMask, QueryTriggerInteraction.Ignore))
            {
                desiredPosition = focus + direction.normalized * Mathf.Max(minimumDistance, hit.distance - collisionRadius);
            }
            float blend = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);
            transform.position = Vector3.Lerp(transform.position, desiredPosition, blend);
            transform.rotation = Quaternion.LookRotation(focus - transform.position, Vector3.up);
        }

        public void SetTarget(Transform followTarget)
        {
            target = followTarget;
        }
    }
}
