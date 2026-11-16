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
        private Rigidbody body;
        private FollowCamera followCamera;
        private bool occupied;
        private Vector2 mobileDriveInput;
        private Transform cockpitAnchor;
        private bool cockpitView;

        public bool IsOccupied => occupied;
        public bool IsCockpitView => cockpitView;

        public void ConfigureCockpit(Transform anchor) { cockpitAnchor = anchor; }
        public float DistanceTo(Vector3 point) => Vector3.Distance(transform.position, point);

        // Persist the player outside the vehicle so a reload never leaves them at a stale seat transform.
        public Vector3 GetSafePlayerSavePosition()
        {
            return occupied && exitPoint != null ? exitPoint.position + Vector3.up * 0.2f : transform.position;
        }

        public Vector3 GetSafePlayerSaveEulerAngles()
        {
            return occupied && exitPoint != null ? exitPoint.eulerAngles : transform.eulerAngles;
        }

        private void Awake()
        {
            Collider carCollider = GetComponent<Collider>();
            carCollider.isTrigger = false;
            body = GetComponent<Rigidbody>();
            if (body == null) body = gameObject.AddComponent<Rigidbody>();
            body.isKinematic = true;
            body.useGravity = false;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
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
            Vector2 keyboard = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            Vector2 input = mobileDriveInput.sqrMagnitude > 0.001f ? mobileDriveInput : keyboard;
            input = Vector2.ClampMagnitude(input, 1f);
            float throttle = input.y;
            float steering = input.x;
            float yaw = steering * turnSpeed * Mathf.Clamp01(Mathf.Abs(throttle) + 0.15f) * Time.deltaTime;
            Quaternion nextRotation = body != null ? body.rotation * Quaternion.Euler(0f, yaw, 0f) : transform.rotation * Quaternion.Euler(0f, yaw, 0f);
            Vector3 nextPosition = transform.position + transform.forward * throttle * driveSpeed * Time.deltaTime;
            if (body != null)
            {
                body.MoveRotation(nextRotation);
                body.MovePosition(nextPosition);
            }
            else
            {
                transform.rotation = nextRotation;
                transform.position = nextPosition;
            }

            if (Input.GetKeyDown(KeyCode.E)) ExitVehicle();
            if (Input.GetKeyDown(KeyCode.C)) ToggleCameraView();
        }

        public void SetMobileDriveInput(Vector2 value) { mobileDriveInput = Vector2.ClampMagnitude(value, 1f); }

        public void ToggleCameraView()
        {
            if (!occupied || followCamera == null || cockpitAnchor == null) return;
            cockpitView = !cockpitView;
            followCamera.SetCockpitView(cockpitAnchor, cockpitView);
            if (!cockpitView) followCamera.SetTarget(transform);
        }

        public bool Enter(ThirdPersonMotor player)
        {
            if (occupied || player == null || DistanceTo(player.transform.position) > 3.5f) return false;
            occupant = player;
            occupied = true;
            occupant.SetRiding(true);
            occupant.transform.SetParent(seatPoint, false);
            occupant.transform.localPosition = Vector3.zero;
            occupant.transform.localRotation = Quaternion.identity;
            if (followCamera != null)
            {
                followCamera.SetTarget(transform);
                followCamera.SetCockpitView(cockpitAnchor, false);
            }
            cockpitView = false;
            return true;
        }

        public void ExitVehicle()
        {
            if (!occupied || occupant == null) return;
            occupant.transform.SetParent(null, true);
            occupant.transform.position = exitPoint.position + Vector3.up * 0.2f;
            occupant.SetRiding(false);
            cockpitView = false;
            if (followCamera != null)
            {
                followCamera.SetCockpitView(null, false);
                followCamera.SetTarget(occupant.transform);
            }
            occupant = null;
            occupied = false;
            mobileDriveInput = Vector2.zero;
        }
    }
}
