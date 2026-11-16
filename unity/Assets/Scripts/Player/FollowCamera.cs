using UnityEngine;

namespace Citygame.Player
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 offset = new Vector3(0f, 4.2f, -6.5f);
        [SerializeField, Min(0.1f)] private float followSharpness = 8f;
        [SerializeField, Range(15f, 80f)] private float pitch = 24f;
        [SerializeField, Min(0.1f)] private float touchOrbitSensitivity = 0.18f;
        [SerializeField, Range(10f, 75f)] private float minimumPitch = 18f;
        [SerializeField, Range(20f, 85f)] private float maximumPitch = 70f;
        private float orbitYaw;
        private float orbitPitch;
        [SerializeField, Min(0.05f)] private float collisionRadius = 0.22f;
        [SerializeField, Min(0.2f)] private float minimumDistance = 1.1f;
        [SerializeField] private LayerMask collisionMask = ~0;

        private void LateUpdate()
        {
            if (target == null) return;
            ReadOrbitInput();

            Quaternion rotation = Quaternion.Euler(orbitPitch, target.eulerAngles.y + orbitYaw, 0f);
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

        private void ReadOrbitInput()
        {
            if (orbitPitch == 0f) orbitPitch = pitch;
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Input.GetMouseButton(0) && Input.mousePosition.x > Screen.width * 0.45f)
            {
                orbitYaw += Input.GetAxis("Mouse X") * 3f;
                orbitPitch = Mathf.Clamp(orbitPitch - Input.GetAxis("Mouse Y") * 3f, minimumPitch, maximumPitch);
            }
#endif
            if (Input.touchCount > 0)
            {
                Touch touch = Input.GetTouch(0);
                if (touch.position.x > Screen.width * 0.45f && touch.phase == TouchPhase.Moved)
                {
                    orbitYaw += touch.deltaPosition.x * touchOrbitSensitivity;
                    orbitPitch = Mathf.Clamp(orbitPitch - touch.deltaPosition.y * touchOrbitSensitivity, minimumPitch, maximumPitch);
                }
            }
        }

        public void SetTarget(Transform followTarget)
        {
            target = followTarget;
            orbitYaw = 0f;
            orbitPitch = pitch;
        }
    }
}
