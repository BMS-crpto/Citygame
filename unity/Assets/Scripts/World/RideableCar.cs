using UnityEngine;
using Citygame.Player;

namespace Citygame.World
{
    [RequireComponent(typeof(Collider))]
    public sealed class RideableCar : MonoBehaviour
    {
        [SerializeField, Min(1f)] private float driveSpeed = 10f;
        [SerializeField, Min(1f)] private float turnSpeed = 65f;
        [SerializeField] private Transform seatPoint;
        [SerializeField] private Transform exitPoint;
        private ThirdPersonMotor occupant;
        private FollowCamera followCamera;
        private bool occupied;

        public bool IsOccupied => occupied;
        public float DistanceTo(Vector3 point) => Vector3.Distance(transform.position, point);

        private void Awake()
        {
            Collider body = GetComponent<Collider>();
            body.isTrigger = false;
            followCamera = FindObjectOfType<FollowCamera>();
            if (seatPoint == null)
            {
                GameObject seat = new GameObject("Driver Seat");
                seat.transform.SetParent(transform, false);
                seat.transform.localPosition = new Vector3(0f, 0.65f, 0.1f);
                seatPoint = seat.transform;
            }
            if (exitPoint == null)
            {
                GameObject exit = new GameObject("Exit Point");
                exit.transform.SetParent(transform, false);
                exit.transform.localPosition = new Vector3(-1.5f, 0f, 0f);
                exitPoint = exit.transform;
            }
        }

        private void Update()
        {
            if (!occupied || occupant == null) return;
            float throttle = Input.GetAxisRaw("Vertical");
            float steering = Input.GetAxisRaw("Horizontal");
            transform.Rotate(0f, steering * turnSpeed * Mathf.Clamp01(Mathf.Abs(throttle) + 0.15f) * Time.deltaTime, 0f);
            transform.position += transform.forward * throttle * driveSpeed * Time.deltaTime;

            if (Input.GetKeyDown(KeyCode.E)) ExitVehicle();
        }

        public bool Enter(ThirdPersonMotor player)
        {
            if (occupied || player == null || DistanceTo(player.transform.position) > 3.5f) return false;
            occupant = player;
            occupied = true;
            occupant.enabled = false;
            occupant.transform.SetParent(seatPoint, false);
            occupant.transform.localPosition = Vector3.zero;
            occupant.transform.localRotation = Quaternion.identity;
            if (followCamera != null) followCamera.SetTarget(transform);
            return true;
        }

        public void ExitVehicle()
        {
            if (!occupied || occupant == null) return;
            occupant.transform.SetParent(null, true);
            occupant.transform.position = exitPoint.position + Vector3.up * 0.2f;
            occupant.enabled = true;
            if (followCamera != null) followCamera.SetTarget(occupant.transform);
            occupant = null;
            occupied = false;
        }
    }
}
