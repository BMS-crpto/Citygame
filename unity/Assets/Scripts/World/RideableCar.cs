using UnityEngine;
using Citygame.Player;

namespace Citygame.World
{
    [RequireComponent(typeof(Collider))]
    public sealed class RideableCar : MonoBehaviour
    {
        [SerializeField, Min(1f)] private float driveSpeed = 14f;
        [SerializeField, Min(1f)] private float turnSpeed = 72f;
        [SerializeField, Min(0.1f)] private float acceleration = 5.5f;
        [SerializeField, Min(0.1f)] private float braking = 11f;
        [SerializeField, Min(0.1f)] private float steeringWheelAngle = 420f;
        [SerializeField] private Transform seatPoint;
        [SerializeField] private Transform exitPoint;
        private ThirdPersonMotor occupant;
        private Rigidbody body;
        private FollowCamera followCamera;
        private bool occupied;
        private Vector2 mobileDriveInput;
        private Transform cockpitAnchor;
        private bool cockpitView;
        private Light[] headlights;
        private bool headlightsOn;
        private Transform steeringWheel;
        private Transform[] wheelVisuals;
        private TextMesh speedDisplay;
        private float currentSpeed;
        private float steeringVisual;

        public bool IsOccupied => occupied;
        public bool IsCockpitView => cockpitView;
        public bool HeadlightsOn => headlightsOn;
        public float SpeedKph => Mathf.Abs(currentSpeed) * 3.6f;

        public void ConfigureDrivingVisuals(Transform wheel, Transform[] tyres, TextMesh display)
        {
            steeringWheel = wheel;
            wheelVisuals = tyres;
            speedDisplay = display;
        }

        public void ConfigureCockpit(Transform anchor) { cockpitAnchor = anchor; }
        public void ConfigureHeadlights(Light[] lights) { headlights = lights; SetHeadlights(false); }

        public void ToggleHeadlights() { SetHeadlights(!headlightsOn); }

        public void SetHeadlights(bool enabled)
        {
            headlightsOn = enabled;
            if (headlights == null) return;
            for (int i = 0; i < headlights.Length; i++)
                if (headlights[i] != null) headlights[i].enabled = enabled;
        }
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
            float targetSpeed = throttle * driveSpeed;
            float rate = Mathf.Abs(throttle) < 0.05f ? braking * 0.32f : (Mathf.Sign(targetSpeed) != Mathf.Sign(currentSpeed) ? braking : acceleration);
            currentSpeed = Mathf.MoveTowards(currentSpeed, targetSpeed, rate * Time.deltaTime);
            if (Mathf.Abs(currentSpeed) < 0.025f) currentSpeed = 0f;

            float steeringFactor = Mathf.Clamp01(Mathf.Abs(currentSpeed) / 2.5f);
            float yaw = steering * turnSpeed * steeringFactor * Mathf.Sign(currentSpeed == 0f ? 1f : currentSpeed) * Time.deltaTime;
            Quaternion nextRotation = body != null ? body.rotation * Quaternion.Euler(0f, yaw, 0f) : transform.rotation * Quaternion.Euler(0f, yaw, 0f);
            Vector3 nextPosition = transform.position + transform.forward * currentSpeed * Time.deltaTime;
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

            steeringVisual = Mathf.Lerp(steeringVisual, steering, 1f - Mathf.Exp(-10f * Time.deltaTime));
            if (steeringWheel != null) steeringWheel.localRotation = Quaternion.Euler(0f, 0f, 90f + steeringVisual * steeringWheelAngle);
            if (wheelVisuals != null)
            {
                float roll = currentSpeed * 360f / (2f * Mathf.PI * 0.34f) * Time.deltaTime;
                for (int i = 0; i < wheelVisuals.Length; i++)
                {
                    if (wheelVisuals[i] == null) continue;
                    wheelVisuals[i].Rotate(Vector3.right, roll, Space.Self);
                }
            }
            if (speedDisplay != null) speedDisplay.text = Mathf.RoundToInt(SpeedKph).ToString("000") + " km/h";

            if (Input.GetKeyDown(KeyCode.E)) ExitVehicle();
            if (Input.GetKeyDown(KeyCode.C)) ToggleCameraView();
            if (Input.GetKeyDown(KeyCode.L)) ToggleHeadlights();
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
            currentSpeed = 0f;
            if (speedDisplay != null) speedDisplay.text = "000 km/h";
        }
    }
}
