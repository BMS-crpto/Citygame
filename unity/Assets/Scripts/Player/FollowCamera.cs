using UnityEngine;

namespace Citygame.Player
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 offset = new Vector3(0f, 4.2f, -6.5f);
        [SerializeField, Min(0.1f)] private float followSharpness = 8f;
        [SerializeField, Range(15f, 80f)] private float pitch = 24f;

        private void LateUpdate()
        {
            if (target == null) return;

            Quaternion rotation = Quaternion.Euler(pitch, target.eulerAngles.y, 0f);
            Vector3 desiredPosition = target.position + rotation * offset;
            float blend = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);
            transform.position = Vector3.Lerp(transform.position, desiredPosition, blend);
            transform.rotation = Quaternion.LookRotation(target.position + Vector3.up * 1.4f - transform.position, Vector3.up);
        }

        public void SetTarget(Transform followTarget)
        {
            target = followTarget;
        }
    }
}
