using UnityEngine;

namespace Citygame.World
{
    [DisallowMultipleComponent]
    public sealed class DayNightCycle : MonoBehaviour
    {
        [SerializeField] private Light sun;
        [SerializeField, Min(60f)] private float fullDaySeconds = 900f;
        [SerializeField, Range(0f, 24f)] private float startingHour = 8f;
        [SerializeField] private bool runCycle = true;

        private float hour;

        public float CurrentHour => hour;
        public string ClockText
        {
            get
            {
                int h = Mathf.FloorToInt(hour) % 24;
                int m = Mathf.FloorToInt((hour - Mathf.Floor(hour)) * 60f);
                return h.ToString("00") + ":" + m.ToString("00");
            }
        }

        private void Start()
        {
            hour = startingHour;
            ApplyLighting();
        }

        private void Update()
        {
            if (!runCycle || fullDaySeconds <= 0f) return;
            hour = Mathf.Repeat(hour + (24f / fullDaySeconds) * Time.deltaTime, 24f);
            ApplyLighting();
        }

        public void SetTime(float gameHour)
        {
            hour = Mathf.Repeat(gameHour, 24f);
            ApplyLighting();
        }

        private void ApplyLighting()
        {
            float sunAngle = (hour / 24f) * 360f - 90f;
            if (sun != null)
            {
                sun.transform.rotation = Quaternion.Euler(sunAngle, -30f, 0f);
                float daylight = Mathf.Clamp01(Mathf.Sin((hour - 6f) / 12f * Mathf.PI));
                sun.intensity = Mathf.Lerp(0.08f, 1.15f, daylight);
                sun.color = Color.Lerp(new Color(0.42f, 0.52f, 0.82f), new Color(1f, 0.94f, 0.78f), daylight);
            }

            float daylightAmount = Mathf.Clamp01(Mathf.Sin((hour - 6f) / 12f * Mathf.PI));
            RenderSettings.ambientLight = Color.Lerp(
                new Color(0.12f, 0.14f, 0.24f),
                new Color(0.58f, 0.58f, 0.54f),
                daylightAmount);
            RenderSettings.fog = true;
            RenderSettings.fogColor = Color.Lerp(
                new Color(0.09f, 0.12f, 0.2f),
                new Color(0.68f, 0.72f, 0.74f),
                daylightAmount);
            RenderSettings.fogDensity = Mathf.Lerp(0.006f, 0.002f, daylightAmount);
        }
    }
}