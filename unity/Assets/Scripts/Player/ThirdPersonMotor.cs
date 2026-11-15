using UnityEngine;

namespace Citygame.Player
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class ThirdPersonMotor : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField, Min(0.1f)] private float walkSpeed = 4.2f;
        [SerializeField, Min(0.1f)] private float sprintSpeed = 6.5f;
        [SerializeField, Min(0.1f)] private float turnSharpness = 12f;
        [SerializeField] private float jumpHeight = 1.15f;
        [SerializeField] private float gravity = -22f;

        [Header("Camera")]
        [SerializeField] private Transform cameraTransform;

        private CharacterController controller;
        private float verticalVelocity;
        private Vector2 mobileInput;
        private bool mobileJumpRequested;

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
            if (cameraTransform == null && Camera.main != null)
                cameraTransform = Camera.main.transform;
        }

        private void Update()
        {
            Vector2 keyboard = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            Vector2 input = mobileInput.sqrMagnitude > 0.001f ? mobileInput : keyboard;
            input = Vector2.ClampMagnitude(input, 1f);

            Vector3 forward = cameraTransform != null ? cameraTransform.forward : Vector3.forward;
            Vector3 right = cameraTransform != null ? cameraTransform.right : Vector3.right;
            forward.y = 0f;
            right.y = 0f;
            forward.Normalize();
            right.Normalize();

            Vector3 move = forward * input.y + right * input.x;
            bool sprint = Input.GetKey(KeyCode.LeftShift);
            float speed = sprint ? sprintSpeed : walkSpeed;

            if (move.sqrMagnitude > 0.001f)
            {
                Quaternion targetRotation = Quaternion.LookRotation(move, Vector3.up);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, turnSharpness * Time.deltaTime);
            }

            if (controller.isGrounded && verticalVelocity < 0f)
                verticalVelocity = -2f;

            if (controller.isGrounded && (Input.GetButtonDown("Jump") || mobileJumpRequested))
                verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            mobileJumpRequested = false;

            verticalVelocity += gravity * Time.deltaTime;
            Vector3 velocity = move * speed;
            velocity.y = verticalVelocity;
            controller.Move(velocity * Time.deltaTime);
        }

        public void SetMobileInput(Vector2 value) { mobileInput = Vector2.ClampMagnitude(value, 1f); }

        public void MobileJump() { mobileJumpRequested = true; }

        public void SetRiding(bool riding)
        {
            if (controller == null) controller = GetComponent<CharacterController>();
            controller.enabled = !riding;
            enabled = !riding;
        }

        public void SetCamera(Transform cameraTarget)
        {
            cameraTransform = cameraTarget;
        }
    }
}
