using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using Citygame.Business;
using Citygame.Player;
using Citygame.World;

namespace Citygame.Game
{
    public sealed class CitygameRuntime : MonoBehaviour
    {
        private const long RegistrationFee = 150000;
        private const long StaffFee = 10000;
        private const int StaffLimit = 10;
        private const float IncomeInterval = 20f;
        private const long IncomePerInterval = 2500;

        [Serializable] private class OwnedBusiness
        {
            public string spotName;
            public string category;
            public int staff;
            public long totalEarned;
        }

        [Serializable] private class SaveData
        {
            public long cash = 1500000;
            public List<OwnedBusiness> businesses = new List<OwnedBusiness>();
        }

        private SaveData save = new SaveData();
        private ThirdPersonMotor motor;
        private DayNightCycle dayNight;
        private BusinessSpot nearby;
        private RideableCar nearbyCar;
        private float incomeClock;
        private string notice = "Welcome to Lagos Life. Explore and build your business.";
        private bool menuOpen;
        private int selectedBusinessIndex;
        private int companyPageOffset;
        private Vector2 phoneScroll;

        private string SavePath => Path.Combine(Application.persistentDataPath, "citygame-unity-save.json");

        private void Awake()
        {
            motor = FindObjectOfType<ThirdPersonMotor>();
            dayNight = FindObjectOfType<DayNightCycle>();
            Load();
        }

        private void Update()
        {
            Vector3 playerPosition = motor != null ? motor.transform.position : transform.position;
            nearby = null;
            float best = 4.5f;
            foreach (BusinessSpot spot in FindObjectsOfType<BusinessSpot>())
            {
                float distance = Vector3.Distance(playerPosition, spot.transform.position);
                if (distance < best) { best = distance; nearby = spot; }
            }

            incomeClock += Time.deltaTime;
            if (incomeClock >= IncomeInterval)
            {
                incomeClock = 0f;
                foreach (OwnedBusiness business in save.businesses)
                {
                    long revenue = IncomePerInterval + business.staff * 500L;
                    business.totalEarned += revenue;
                    save.cash += revenue;
                }
                Save();
            }
            nearbyCar = null;
            float carDistance = 4.5f;
            foreach (RideableCar car in FindObjectsOfType<RideableCar>())
            {
                float distance = car.DistanceTo(playerPosition);
                if (distance < carDistance) { carDistance = distance; nearbyCar = car; }
            }

            if (Input.GetKeyDown(KeyCode.Tab)) menuOpen = !menuOpen;
        }

        private void OnGUI()
        {
            GUI.skin.button.fontSize = Mathf.Clamp(Screen.width / 48, 14, 24);
            GUI.skin.label.fontSize = Mathf.Clamp(Screen.width / 52, 14, 22);
            GUI.Box(new Rect(12, 12, 260, 74), "LAGOS LIFE | UNITY PROTOTYPE");
            GUI.Label(new Rect(24, 42, 230, 28), "Wallet: ₦" + save.cash.ToString("N0"));
            if (dayNight != null) GUI.Label(new Rect(24, 64, 230, 20), "Lagos time: " + dayNight.ClockText);

            if (!string.IsNullOrEmpty(notice))
                GUI.Box(new Rect(12, 92, Mathf.Min(Screen.width - 24, 420), 48), notice);

            // Touch-friendly directional pad. Keyboard WASD/arrows and space also work.
            float button = Mathf.Clamp(Screen.width * 0.105f, 54f, 88f);
            float baseX = 18f, baseY = Screen.height - button * 2.35f;
            if (motor != null)
            {
                Vector2 input = Vector2.zero;
                if (GUI.RepeatButton(new Rect(baseX + button, baseY, button, button), "↑")) input.y += 1;
                if (GUI.RepeatButton(new Rect(baseX + button, baseY + button, button, button), "↓")) input.y -= 1;
                if (GUI.RepeatButton(new Rect(baseX, baseY + button, button, button), "←")) input.x -= 1;
                if (GUI.RepeatButton(new Rect(baseX + button * 2, baseY + button, button, button), "→")) input.x += 1;

                if (motor.enabled)
                {
                    motor.SetMobileInput(input);
                    if (GUI.Button(new Rect(Screen.width - button * 1.25f, Screen.height - button * 1.35f, button, button), "JUMP"))
                        motor.MobileJump();
                }
                else if (nearbyCar != null && nearbyCar.IsOccupied)
                {
                    nearbyCar.SetMobileDriveInput(input);
                }
            }

            if (nearbyCar != null)
            {
                string carAction = nearbyCar.IsOccupied ? "EXIT CAR · E" : "ENTER CAR";
                if (GUI.Button(new Rect(Screen.width - button * 2.2f, Screen.height - button * 2.45f, button * 2f, button), carAction))
                {
                    if (nearbyCar.IsOccupied) nearbyCar.ExitVehicle();
                    else if (motor != null && nearbyCar.Enter(motor)) notice = "Vehicle entered. Use WASD / arrows to drive; E to exit.";
                }
            }

            bool portrait = Screen.height > Screen.width;
            float phoneWidth = portrait ? Screen.width - 24f : Mathf.Min(360f, Screen.width * 0.42f);
            float phoneX = portrait ? 12f : Screen.width - phoneWidth - 16f;
            Rect menuRect = new Rect(portrait ? Screen.width - 168f : Screen.width - 230f, 12,
                portrait ? 156f : 218f, 50f);
            GUI.color = new Color(0.25f, 0.85f, 0.72f);
            if (GUI.Button(menuRect, menuOpen ? "✕ CLOSE PHONE" : "▣ PHONE / BUSINESS"))
                menuOpen = !menuOpen;
            GUI.color = Color.white;

            if (menuOpen)
            {
                float panelTop = portrait ? 72f : 70f;
                float panelHeight = Mathf.Max(150f, Screen.height - panelTop - 16f);
                Rect panel = new Rect(phoneX, panelTop, phoneWidth, panelHeight);
                GUI.color = new Color(0.08f, 0.11f, 0.16f, 0.97f);
                GUI.Box(panel, GUIContent.none);
                GUI.color = Color.white;

                float pad = 12f;
                float contentWidth = phoneWidth - pad * 2f;
                GUI.color = new Color(0.25f, 0.85f, 0.72f);
                GUI.Label(new Rect(phoneX + pad, panelTop + 8f, contentWidth, 28f), "LAGOS LIFE  /  MY COMPANIES");
                GUI.color = Color.white;
                GUI.Label(new Rect(phoneX + pad, panelTop + 34f, contentWidth, 24f),
                    "Wallet  ₦" + save.cash.ToString("N0") + "    •    Owned " + save.businesses.Count);

                Rect scrollRect = new Rect(phoneX + pad, panelTop + 62f, contentWidth, panelHeight - 74f);
                float contentHeight = 600f + save.businesses.Count * 46f;
                phoneScroll = GUI.BeginScrollView(scrollRect, phoneScroll,
                    new Rect(0, 0, contentWidth - 18f, contentHeight));

                float x = 0f, y = 0f, rowWidth = contentWidth - 22f;
                GUI.color = new Color(0.95f, 0.78f, 0.34f);
                GUI.Label(new Rect(x, y, rowWidth, 26f), "NEARBY OPPORTUNITY");
                GUI.color = Color.white;
                y += 28f;
                if (nearby != null)
                {
                    GUI.Label(new Rect(x, y, rowWidth, 34f), nearby.BusinessName + "  •  " + nearby.Category);
                    y += 36f;
                    GUI.color = new Color(0.25f, 0.85f, 0.72f);
                    if (GUI.Button(new Rect(x, y, rowWidth, 44f), "REGISTER BUSINESS  ·  ₦150,000"))
                        Register(nearby);
                    GUI.color = Color.white;
                    y += 52f;
                }
                else
                {
                    GUI.Label(new Rect(x, y, rowWidth, 48f), "No business nearby. Walk up to a shop frontage to register it.");
                    y += 52f;
                }

                GUI.color = new Color(0.95f, 0.78f, 0.34f);
                GUI.Label(new Rect(x, y, rowWidth, 26f), "YOUR COMPANY PORTFOLIO");
                GUI.color = Color.white;
                y += 30f;
                if (save.businesses.Count == 0)
                {
                    GUI.Label(new Rect(x, y, rowWidth, 48f), "You have no companies yet. Register a nearby business to get started.");
                    y += 52f;
                }
                else
                {
                    selectedBusinessIndex = Mathf.Clamp(selectedBusinessIndex, 0, save.businesses.Count - 1);
                    int maxOffset = ((save.businesses.Count - 1) / 4) * 4;
                    companyPageOffset = Mathf.Clamp(companyPageOffset, 0, maxOffset);
                    int pageEnd = Mathf.Min(companyPageOffset + 4, save.businesses.Count);
                    if (selectedBusinessIndex < companyPageOffset || selectedBusinessIndex >= pageEnd)
                        selectedBusinessIndex = companyPageOffset;

                    if (save.businesses.Count > 4)
                    {
                        if (GUI.Button(new Rect(x, y, rowWidth * 0.48f, 34f), "‹  PREVIOUS"))
                            companyPageOffset = Mathf.Max(0, companyPageOffset - 4);
                        if (GUI.Button(new Rect(x + rowWidth * 0.52f, y, rowWidth * 0.48f, 34f), "NEXT  ›"))
                            companyPageOffset = Mathf.Min(maxOffset, companyPageOffset + 4);
                        y += 40f;
                    }

                    for (int i = companyPageOffset; i < pageEnd; i++)
                    {
                        OwnedBusiness company = save.businesses[i];
                        string row = (i == selectedBusinessIndex ? "▶  " : "") + company.spotName +
                            "\n" + company.category + "  •  Staff " + company.staff + "/" + StaffLimit;
                        if (GUI.Button(new Rect(x, y, rowWidth, 48f), row))
                            selectedBusinessIndex = i;
                        y += 52f;
                    }

                    OwnedBusiness selected = save.businesses[selectedBusinessIndex];
                    GUI.color = new Color(0.25f, 0.85f, 0.72f);
                    GUI.Label(new Rect(x, y, rowWidth, 28f), "COMPANY DETAILS");
                    GUI.color = Color.white;
                    y += 30f;
                    GUI.Label(new Rect(x, y, rowWidth, 28f), "Lifetime earnings  ₦" + selected.totalEarned.ToString("N0"));
                    y += 32f;
                    GUI.Label(new Rect(x, y, rowWidth, 28f), "Staff employed  " + selected.staff + "/" + StaffLimit);
                    y += 34f;
                    if (GUI.Button(new Rect(x, y, rowWidth, 44f), "HIRE STAFF  ·  ₦10,000"))
                        Hire(selected);
                    y += 52f;
                }

                if (GUI.Button(new Rect(x, y, rowWidth, 42f), "SAVE GAME"))
                {
                    Save();
                    notice = "Game saved on this device.";
                }
                GUI.EndScrollView();
            }
        }

        private void Register(BusinessSpot spot)
        {
            if (save.businesses.Exists(b => b.spotName == spot.BusinessName))
            { notice = "You already own this business."; return; }
            if (save.cash < RegistrationFee) { notice = "Not enough cash for registration."; return; }
            save.cash -= RegistrationFee;
            save.businesses.Add(new OwnedBusiness { spotName = spot.BusinessName, category = spot.Category.ToString() });
            notice = "Registered " + spot.BusinessName + "! Earnings start automatically.";
            Save();
        }

        private void Hire(OwnedBusiness business)
        {
            if (business.staff >= StaffLimit) { notice = "Staff roster is full."; return; }
            if (save.cash < StaffFee) { notice = "Not enough cash to hire."; return; }
            save.cash -= StaffFee;
            business.staff++;
            notice = "Staff hired. Your business income increased.";
            Save();
        }

        private void Save()
        {
            try { File.WriteAllText(SavePath, JsonUtility.ToJson(save, true)); }
            catch (Exception e) { Debug.LogWarning("Citygame save failed: " + e.Message); }
        }

        private void Load()
        {
            try
            {
                if (File.Exists(SavePath))
                {
                    SaveData loaded = JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath));
                    if (loaded != null) save = loaded;
                    if (save.businesses == null) save.businesses = new List<OwnedBusiness>();
                }
            }
            catch (Exception e) { Debug.LogWarning("Citygame load failed: " + e.Message); }
        }
    }
}
