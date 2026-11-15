using UnityEngine;

namespace Citygame.World
{
    /// <summary>Lightweight tropical weather that follows the player and cycles clear, cloudy and rainy conditions.</summary>
    [DisallowMultipleComponent]
    public sealed class LagosWeatherSystem : MonoBehaviour
    {
        [SerializeField] private Transform player;
        [SerializeField] private DayNightCycle dayNight;
        [SerializeField, Min(45f)] private float weatherChangeSeconds = 180f;
        [SerializeField, Min(50f)] private float rainRate = 420f;
        private ParticleSystem rain;
        private float changeClock;
        private int presetIndex;
        private static readonly DayNightCycle.WeatherPreset[] Presets = {
            DayNightCycle.WeatherPreset.Clear,
            DayNightCycle.WeatherPreset.Cloudy,
            DayNightCycle.WeatherPreset.Overcast,
            DayNightCycle.WeatherPreset.Rain
        };

        private void Start()
        {
            if (player == null)
            {
                ThirdPersonMotor motor = FindObjectOfType<Citygame.Player.ThirdPersonMotor>();
                if (motor != null) player = motor.transform;
            }
            if (dayNight == null) dayNight = FindObjectOfType<DayNightCycle>();
            CreateRain();
            ApplyPreset(Presets[presetIndex]);
        }

        private void Update()
        {
            if (player != null && rain != null) rain.transform.position = player.position;
            changeClock += Time.deltaTime;
            if (weatherChangeSeconds > 0f && changeClock >= weatherChangeSeconds)
            {
                changeClock = 0f;
                presetIndex = (presetIndex + 1) % Presets.Length;
                ApplyPreset(Presets[presetIndex]);
            }
        }

        public void SetWeather(DayNightCycle.WeatherPreset preset)
        {
            for (int i = 0; i < Presets.Length; i++)
                if (Presets[i] == preset) presetIndex = i;
            ApplyPreset(preset);
        }

        private void ApplyPreset(DayNightCycle.WeatherPreset preset)
        {
            if (dayNight != null) dayNight.SetWeather(preset);
            if (rain == null) return;
            if (preset == DayNightCycle.WeatherPreset.Rain)
            {
                var emission = rain.emission;
                emission.rateOverTime = rainRate;
                if (!rain.isPlaying) rain.Play();
            }
            else if (rain.isPlaying) rain.Stop(true, ParticleSystemStopBehavior.StopEmitting);
        }

        private void CreateRain()
        {
            GameObject rainObject = new GameObject("Tropical Rain Particles");
            rainObject.transform.SetParent(transform, false);
            rain = rainObject.AddComponent<ParticleSystem>();
            var main = rain.main;
            main.loop = true;
            main.duration = 2f;
            main.startLifetime = 1.25f;
            main.startSpeed = 17f;
            main.startSize = 0.035f;
            main.startColor = new Color(0.72f, 0.82f, 0.94f, 0.62f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 1800;
            main.gravityModifier = 0.15f;
            var emission = rain.emission;
            emission.rateOverTime = 0f;
            var shape = rain.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(22f, 0.1f, 22f);
            shape.position = new Vector3(0f, 13f, 0f);
            var renderer = rain.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.lengthScale = 4f;
            Shader particleShader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (particleShader == null) particleShader = Shader.Find("Particles/Standard Unlit");
            if (particleShader != null) renderer.material = new Material(particleShader);
            rain.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        }
    }
}
