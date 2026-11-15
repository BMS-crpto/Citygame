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
        private BusinessSpot nearby;
        private RideableCar nearbyCar;
        private float incomeClock;
        private string notice = "Welcome to Lagos Life. Explore and build your business.";
        private bool menuOpen;
        private int selectedBusinessIndex;

        private string SavePath => Path.Combine(Application.persistentDataPath, "citygame-unity-save.json");

        private void Awake()
        {
            motor = FindObjectOfType<ThirdPersonMotor>();
            Load();
        }

        private void Update()
        {
            nearby = null;
            float best = 4.5f;
            foreach (BusinessSpot spot in FindObjectsOfType<BusinessSpot>())
            {
                float distance = Vector3.Distance(transform.position, spot.transform.position);
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
                float distance = car.DistanceTo(transform.position);
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

            Rect menuRect = new Rect(Screen.width - 230, 12, 218, 50);
            if (GUI.Button(menuRect, menuOpen ? "CLOSE BUSINESS MENU" : "BUSINESS / PHONE"))
                menuOpen = !menuOpen;

            if (menuOpen)
            {
                float x = Screen.width - 270, y = 70;
                float panelHeight = Mathf.Min(Screen.height - 90, 520f);
                GUI.Box(new Rect(x, y, 258, panelHeight), "PHONE · MY COMPANIES");
                y += 34;
                if (nearby != null)
                {
                    GUI.Label(new Rect(x + 12, y, 234, 28), "Nearby: " + nearby.BusinessName);
                    y += 32;
                    if (GUI.Button(new Rect(x + 12, y, 234, 40), "Register · ₦150,000"))
                        Register(nearby);
                    y += 48;
                }
                else
                {
                    GUI.Label(new Rect(x + 12, y, 234, 42), "Walk to a business frontage to register it.");
                    y += 48;
                }

                GUI.Label(new Rect(x + 12, y, 234, 28), "Owned companies: " + save.businesses.Count);
                y += 30;
                if (save.businesses.Count == 0)
                {
                    GUI.Label(new Rect(x + 12, y, 234, 48), "Register a business to manage staff and income.");
                    y += 52;
                }
                else
                {
                    selectedBusinessIndex = Mathf.Clamp(selectedBusinessIndex, 0, save.businesses.Count - 1);
                    for (int i = 0; i < save.businesses.Count && i < 4; i++)
                    {
                        OwnedBusiness company = save.businesses[i];
                        string row = (i == selectedBusinessIndex ? "▶ " : "") + company.spotName +
                            " · Staff " + company.staff + "/" + StaffLimit;
                        if (GUI.Button(new Rect(x + 12, y, 234, 42), row))
                            selectedBusinessIndex = i;
                        y += 46;
                    }
                    y += 4;
                    OwnedBusiness selected = save.businesses[selectedBusinessIndex];
                    GUI.Label(new Rect(x + 12, y, 234, 30), "Category: " + selected.category);
                    y += 30;
                    GUI.Label(new Rect(x + 12, y, 234, 30), "Total earned: ₦" + selected.totalEarned.ToString("N0"));
                    y += 32;
                    if (GUI.Button(new Rect(x + 12, y, 234, 40), "Hire staff · ₦10,000"))
                        Hire(selected);
                    y += 46;
                }

                if (GUI.Button(new Rect(x + 12, y, 234, 38), "Save game"))
                {
                    Save();
                    notice = "Game saved on this device.";
                }
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
