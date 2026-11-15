using UnityEngine;

namespace Citygame.World
{
    [DisallowMultipleComponent]
    public sealed class DayNightCycle : MonoBehaviour
    {
        public enum WeatherPreset { Clear, Cloudy, Overcast, Dusty }

        [SerializeField] private Light sun;
        [SerializeField, Min(60f)] private float fullDaySeconds = 900f;
        [SerializeField, Range(0f, 24f)] private float startingHour = 8f;
        [SerializeField] private bool runCycle = true;
        [SerializeField] private WeatherPreset weather = WeatherPreset.Clear;

        private float hour;
        private Material skyboxMaterial;

        public float CurrentHour => hour;
        public WeatherPreset CurrentWeather => weather;
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
            skyboxMaterial = RenderSettings.skybox;
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

        public void SetWeather(WeatherPreset preset)
        {
            weather = preset;
            ApplyLighting();
        }

        private void ApplyLighting()
        {
            float daylight = Mathf.Clamp01(Mathf.Sin((hour - 6f) / 12f * Mathf.PI));
            float weatherLight = weather == WeatherPreset.Clear ? 1f :
                weather == WeatherPreset.Cloudy ? 0.82f :
                weather == WeatherPreset.Overcast ? 0.62f : 0.72f;

            if (sun != null)
            {
                float sunAngle = (hour / 24f) * 360f - 90f;
                sun.transform.rotation = Quaternion.Euler(sunAngle, -30f, 0f);
                sun.intensity = Mathf.Lerp(0.06f, 1.25f, daylight) * weatherLight;
                sun.color = Color.Lerp(new Color(0.48f, 0.56f, 0.78f),
                    new Color(1f, 0.94f, 0.80f), daylight);
                sun.shadowStrength = Mathf.Lerp(0.45f, 0.9f, daylight) * weatherLight;
            }

            Color nightAmbient = new Color(0.12f, 0.15f, 0.24f);
            Color dayAmbient = new Color(0.60f, 0.62f, 0.60f);
            Color ambient = Color.Lerp(nightAmbient, dayAmbient, daylight) * weatherLight;
            RenderSettings.ambientLight = ambient;
            RenderSettings.ambientIntensity = Mathf.Lerp(0.65f, 1.15f, daylight) * weatherLight;

            // Keep the city skyline crisp; bright fog previously washed out buildings and roads.
            RenderSettings.fog = weather == WeatherPreset.Dusty;
            RenderSettings.fogMode = FogMode.Exponential;
            RenderSettings.fogColor = weather == WeatherPreset.Dusty
                ? new Color(0.72f, 0.62f, 0.48f)
                : ambient;
            RenderSettings.fogDensity = weather == WeatherPreset.Dusty
                ? Mathf.Lerp(0.0025f, 0.006f, daylight)
                : 0f;

            if (skyboxMaterial != null)
            {
                if (skyboxMaterial.HasProperty("_Exposure"))
                    skyboxMaterial.SetFloat("_Exposure", Mathf.Lerp(0.75f, 1.15f, daylight) * weatherLight);
                if (skyboxMaterial.HasProperty("_Tint"))
                    skyboxMaterial.SetColor("_Tint", Color.Lerp(
                        new Color(0.55f, 0.62f, 0.82f), Color.white, daylight) * weatherLight);
                if (skyboxMaterial.HasProperty("_SkyTint"))
                    skyboxMaterial.SetColor("_SkyTint", Color.Lerp(
                        new Color(0.45f, 0.52f, 0.72f), new Color(0.5f, 0.68f, 0.9f), daylight) * weatherLight);
            }
        }
    }
}