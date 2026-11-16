using UnityEngine;

namespace Citygame.Game
{
    /// <summary>
    /// On-screen graphics presets for mobile devices. Keeps the quality controls
    /// available during play without requiring a separate settings scene.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class CitygameMobileGraphics : MonoBehaviour
    {
        private enum GraphicsPreset { Quality, Balanced, Performance }
        private GraphicsPreset preset;
        private bool panelOpen;

        private void Awake()
        {
            preset = (GraphicsPreset)Mathf.Clamp(PlayerPrefs.GetInt("citygame.graphicsPreset", 1), 0, 2);
            ApplyPreset();
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.G)) panelOpen = !panelOpen;
        }

        private void OnGUI()
        {
            GUI.skin.button.fontSize = Mathf.Clamp(Screen.width / 64, 12, 18);
            float width = Mathf.Clamp(Screen.width * 0.22f, 92f, 150f);
            float height = Mathf.Clamp(Screen.height * 0.045f, 34f, 48f);
            Rect toggle = new Rect(Screen.width - width - 12f, Screen.height * 0.36f, width, height);
            if (GUI.Button(toggle, "GFX · " + preset.ToString().ToUpperInvariant()))
                panelOpen = !panelOpen;

            if (!panelOpen) return;
            float panelWidth = Mathf.Min(260f, Screen.width - 24f);
            float panelHeight = 174f;
            Rect panel = new Rect(Screen.width - panelWidth - 12f, toggle.y + height + 6f, panelWidth, panelHeight);
            GUI.Box(panel, "MOBILE GRAPHICS");
            float rowY = panel.y + 32f;
            string[] labels = { "QUALITY · 60 FPS target", "BALANCED · 45 FPS target", "PERFORMANCE · 30 FPS target" };
            for (int i = 0; i < labels.Length; i++)
            {
                Rect row = new Rect(panel.x + 8f, rowY + i * 42f, panel.width - 16f, 36f);
                GUI.enabled = (int)preset != i;
                if (GUI.Button(row, labels[i]))
                {
                    preset = (GraphicsPreset)i;
                    PlayerPrefs.SetInt("citygame.graphicsPreset", i);
                    PlayerPrefs.Save();
                    ApplyPreset();
                }
            }
            GUI.enabled = true;
            if (GUI.Button(new Rect(panel.x + 8f, panel.yMax - 34f, panel.width - 16f, 28f), "CLOSE"))
                panelOpen = false;
        }

        private void ApplyPreset()
        {
            switch (preset)
            {
                case GraphicsPreset.Quality:
                    QualitySettings.shadows = ShadowQuality.All;
                    QualitySettings.shadowResolution = ShadowResolution.High;
                    QualitySettings.shadowDistance = 60f;
                    QualitySettings.antiAliasing = 4;
                    Application.targetFrameRate = 60;
                    break;
                case GraphicsPreset.Balanced:
                    QualitySettings.shadows = ShadowQuality.HardOnly;
                    QualitySettings.shadowResolution = ShadowResolution.Medium;
                    QualitySettings.shadowDistance = 32f;
                    QualitySettings.antiAliasing = 2;
                    Application.targetFrameRate = 45;
                    break;
                default:
                    QualitySettings.shadows = ShadowQuality.Disable;
                    QualitySettings.shadowDistance = 0f;
                    QualitySettings.antiAliasing = 0;
                    Application.targetFrameRate = 30;
                    break;
            }
            QualitySettings.vSyncCount = 0;
        }
    }
}