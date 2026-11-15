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

        [Serializable] private class SocialPost
        {
            public string author = "You";
            public string message;
            public int likes;
            public List<string> replies = new List<string>();
        }

        [Serializable] private class SaveData
        {
            public long cash = 1500000;
            public float energy = 100f;
            public float hunger = 100f;
            public float hygiene = 100f;
            public float fun = 100f;
            public long jobEarnings;
            public List<OwnedBusiness> businesses = new List<OwnedBusiness>();
            public List<SocialPost> posts = new List<SocialPost>();
        }

        private SaveData save = new SaveData();
        private ThirdPersonMotor motor;
        private DayNightCycle dayNight;
        private BusinessSpot nearby;
        private RideableCar nearbyCar;
        private BusinessSpot selectedDestination;
        private float incomeClock;
        private float needsClock;
        private string notice = "Welcome to Lagos Life. Explore and build your business.";
        private bool menuOpen;
        private int selectedBusinessIndex;
        private int companyPageOffset;
        private Vector2 phoneScroll;
        private string activePhoneApp = "Home";
        private string socialDraft = "";
        private string socialReplyDraft = "";
        private int replyTarget = -1;

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

            needsClock += Time.deltaTime;
            if (needsClock >= 60f)
            {
                needsClock = 0f;
                save.hunger = Mathf.Clamp(save.hunger - 2f, 0f, 100f);
                save.energy = Mathf.Clamp(save.energy - 1.5f, 0f, 100f);
                save.hygiene = Mathf.Clamp(save.hygiene - 1f, 0f, 100f);
                save.fun = Mathf.Clamp(save.fun - 0.75f, 0f, 100f);
                Save();
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
            GUI.skin.button.fontSize = Mathf.Clamp(Screen.width / 58, 13, 20);
            GUI.skin.label.fontSize = Mathf.Clamp(Screen.width / 62, 13, 19);
            bool portrait = Screen.height > Screen.width;
            GUI.Box(new Rect(12, 12, 250, 70), "LAGOS LIFE");
            GUI.Label(new Rect(24, 42, 220, 26), "₦" + save.cash.ToString("N0"));
            GUI.Label(new Rect(12, 84, Mathf.Min(Screen.width - 24, 380), 24), "Energy " + save.energy.ToString("0") + " | Hunger " + save.hunger.ToString("0") + " | Hygiene " + save.hygiene.ToString("0"));
            if (dayNight != null) GUI.Label(new Rect(24, 62, 220, 20), dayNight.ClockText);

            if (!string.IsNullOrEmpty(notice))
                GUI.Box(new Rect(12, 88, Mathf.Min(Screen.width - 24, 380), 44), notice);
            if (selectedDestination != null)
            {
                float destinationDistance = Vector3.Distance(motor != null ? motor.transform.position : transform.position, selectedDestination.transform.position);
                GUI.Box(new Rect(12, 136, Mathf.Min(Screen.width - 24, 300), 42), "NAV: " + selectedDestination.BusinessName + " · " + destinationDistance.ToString("0") + "m");
            }

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
                else if (nearbyCar != null && nearbyCar.IsOccupied) nearbyCar.SetMobileDriveInput(input);
            }

            if (nearbyCar != null)
            {
                string action = nearbyCar.IsOccupied ? "EXIT CAR" : "ENTER CAR";
                if (GUI.Button(new Rect(Screen.width - button * 2.2f, Screen.height - button * 2.45f, button * 2f, button), action))
                {
                    if (nearbyCar.IsOccupied) nearbyCar.ExitVehicle();
                    else if (motor != null && nearbyCar.Enter(motor)) notice = "Vehicle entered.";
                }
            }

            float phoneWidth = portrait ? Screen.width - 20f : Mathf.Min(420f, Screen.width * 0.43f);
            float phoneHeight = portrait ? Screen.height - 24f : Mathf.Min(Screen.height - 24f, 760f);
            float phoneX = portrait ? 10f : Screen.width - phoneWidth - 12f;
            float phoneY = portrait ? 12f : (Screen.height - phoneHeight) * 0.5f;
            Rect toggle = new Rect(portrait ? Screen.width - 142f : Screen.width - 210f, 10f,
                portrait ? 132f : 198f, 44f);
            GUI.color = new Color(0.2f, 0.82f, 0.72f);
            if (GUI.Button(toggle, menuOpen ? "CLOSE PHONE" : "▣ OPEN PHONE")) menuOpen = !menuOpen;
            GUI.color = Color.white;
            if (!menuOpen) return;

            // iPhone-inspired device shell and screen. Apps open inside the phone rather than below it.
            GUI.color = new Color(0.025f, 0.03f, 0.045f, 0.98f);
            GUI.Box(new Rect(phoneX, phoneY, phoneWidth, phoneHeight), GUIContent.none);
            GUI.color = Color.white;
            float inset = Mathf.Max(7f, phoneWidth * 0.025f);
            Rect screen = new Rect(phoneX + inset, phoneY + inset, phoneWidth - inset * 2f, phoneHeight - inset * 2f);
            GUI.color = activePhoneApp == "Home" ? new Color(0.12f, 0.2f, 0.34f) : new Color(0.92f, 0.94f, 0.97f);
            GUI.Box(screen, GUIContent.none);
            GUI.color = activePhoneApp == "Home" ? Color.white : new Color(0.08f, 0.1f, 0.14f);
            float topBar = 34f;
            GUI.Label(new Rect(screen.x + 12f, screen.y + 5f, screen.width * 0.55f, 24f),
                dayNight != null ? dayNight.ClockText : "9:41");
            GUI.Label(new Rect(screen.xMax - 92f, screen.y + 5f, 80f, 24f), "●●●  Wi-Fi  ▰");
            GUI.color = Color.white;

            Rect appArea = new Rect(screen.x + 8f, screen.y + topBar, screen.width - 16f, screen.height - topBar - 38f);
            if (activePhoneApp == "Home")
            {
                GUI.color = Color.white;
                GUI.Label(new Rect(appArea.x + 12f, appArea.y + 8f, appArea.width - 24f, 52f),
                    "Lagos Life\n₦" + save.cash.ToString("N0") + "  •  " + save.businesses.Count + " companies");
                GUI.color = Color.white;
                string[] names = { "Business", "Map", "Social", "Wallet", "Jobs", "Settings", "Cars", "Profile" };
                string[] glyphs = { "🏢", "🗺", "💬", "₦", "💼", "⚙", "🚗", "👤" };
                int cols = portrait ? 4 : 3;
                float gap = 8f, cellW = (appArea.width - gap * (cols - 1)) / cols;
                float cellH = Mathf.Min(92f, appArea.height * 0.19f);
                float gridY = appArea.y + 72f;
                for (int i = 0; i < names.Length; i++)
                {
                    int col = i % cols, row = i / cols;
                    Rect cell = new Rect(appArea.x + col * (cellW + gap), gridY + row * (cellH + 12f), cellW, cellH);
                    GUI.color = new Color(0.18f + (i % 3) * 0.1f, 0.35f + (i % 2) * 0.12f, 0.62f, 1f);
                    if (GUI.Button(cell, glyphs[i] + "\n" + names[i])) activePhoneApp = names[i];
                    GUI.color = Color.white;
                }
                float dockY = screen.yMax - 48f;
                GUI.color = new Color(0.1f, 0.14f, 0.22f, 0.9f);
                GUI.Box(new Rect(screen.x + 12f, dockY, screen.width - 24f, 38f), GUIContent.none);
                GUI.color = Color.white;
                string[] dock = { "Business", "Map", "Social", "Wallet" };
                for (int i = 0; i < dock.Length; i++)
                {
                    float dw = (screen.width - 32f) / dock.Length;
                    if (GUI.Button(new Rect(screen.x + 16f + i * dw, dockY + 2f, dw - 4f, 34f), dock[i]))
                        activePhoneApp = dock[i];
                }
            }
            else
            {
                GUI.color = new Color(0.08f, 0.1f, 0.14f);
                if (GUI.Button(new Rect(appArea.x, appArea.y, 90f, 34f), "‹ Home")) activePhoneApp = "Home";
                GUI.Label(new Rect(appArea.x + 98f, appArea.y + 2f, appArea.width - 100f, 32f), activePhoneApp.ToUpperInvariant());
                GUI.color = Color.white;
                Rect body = new Rect(appArea.x + 4f, appArea.y + 42f, appArea.width - 8f, appArea.height - 46f);
                float contentHeight = activePhoneApp == "Social" ? Mathf.Max(800f, 360f + save.posts.Count * 150f) : 800f;
                phoneScroll = GUI.BeginScrollView(body, phoneScroll, new Rect(0, 0, body.width - 18f, contentHeight));
                float x = 0f, y = 0f, w = body.width - 28f;

                if (activePhoneApp == "Business")
                {
                    GUI.Label(new Rect(x, y, w, 30f), "NEARBY BUSINESS");
                    y += 30f;
                    if (nearby != null)
                    {
                        GUI.Label(new Rect(x, y, w, 42f), nearby.BusinessName + "\n" + nearby.Category);
                        y += 44f;
                        if (GUI.Button(new Rect(x, y, w, 46f), "Register business · ₦150,000")) Register(nearby);
                        y += 54f;
                    }
                    else { GUI.Label(new Rect(x, y, w, 48f), "Walk near a storefront to register a business."); y += 52f; }
                    GUI.Label(new Rect(x, y, w, 30f), "MY COMPANIES (" + save.businesses.Count + ")");
                    y += 32f;
                    if (save.businesses.Count > 0)
                    {
                        int maxOffset = ((save.businesses.Count - 1) / 4) * 4;
                        companyPageOffset = Mathf.Clamp(companyPageOffset, 0, maxOffset);
                        if (save.businesses.Count > 4)
                        {
                            if (GUI.Button(new Rect(x, y, w * 0.48f, 34f), "‹ Previous")) companyPageOffset = Mathf.Max(0, companyPageOffset - 4);
                            if (GUI.Button(new Rect(x + w * 0.52f, y, w * 0.48f, 34f), "Next ›")) companyPageOffset = Mathf.Min(maxOffset, companyPageOffset + 4);
                            y += 40f;
                        }
                        int pageEnd = Mathf.Min(companyPageOffset + 4, save.businesses.Count);
                        selectedBusinessIndex = Mathf.Clamp(selectedBusinessIndex, companyPageOffset, pageEnd - 1);
                        for (int i = companyPageOffset; i < pageEnd; i++)
                        {
                            OwnedBusiness b = save.businesses[i];
                            if (GUI.Button(new Rect(x, y, w, 48f), (i == selectedBusinessIndex ? "▶ " : "") + b.spotName + "\n" + b.category + " • Staff " + b.staff + "/" + StaffLimit))
                                selectedBusinessIndex = i;
                            y += 52f;
                        }
                        OwnedBusiness selected = save.businesses[selectedBusinessIndex];
                        GUI.Label(new Rect(x, y, w, 28f), "Lifetime earnings ₦" + selected.totalEarned.ToString("N0")); y += 30f;
                        if (GUI.Button(new Rect(x, y, w, 44f), "Hire staff · ₦10,000")) Hire(selected);
                        y += 50f;
                    }
                    if (GUI.Button(new Rect(x, y, w, 40f), "Save game")) { Save(); notice = "Saved to this device."; }
                }
                else if (activePhoneApp == "Wallet")
                {
                    GUI.Label(new Rect(x, y, w, 48f), "AVAILABLE BALANCE\n₦" + save.cash.ToString("N0")); y += 58f;
                    GUI.Label(new Rect(x, y, w, 42f), "Local prototype wallet. Your balance and company earnings save on this device.");
                }
                else if (activePhoneApp == "Map")
                {
                    GUI.Label(new Rect(x, y, w, 34f), "LAGOS CITY MAP"); y += 38f;
                    GUI.Label(new Rect(x, y, w, 34f), "Nearby: " + (nearby != null ? nearby.BusinessName : "No storefront in range")); y += 38f;
                    Rect mapRect = new Rect(x, y, w, 260f);
                    GUI.color = new Color(0.78f, 0.84f, 0.76f);
                    GUI.Box(mapRect, GUIContent.none);
                    GUI.color = new Color(0.25f, 0.27f, 0.29f);
                    GUI.Box(new Rect(mapRect.x, mapRect.y + 118f, mapRect.width, 28f), GUIContent.none);
                    GUI.Box(new Rect(mapRect.x + mapRect.width * 0.47f, mapRect.y, mapRect.width * 0.12f, mapRect.height), GUIContent.none);
                    GUI.color = new Color(0.95f, 0.85f, 0.5f);
                    GUI.Box(new Rect(mapRect.x, mapRect.y + 131f, mapRect.width, 2f), GUIContent.none);
                    GUI.Box(new Rect(mapRect.x + mapRect.width * 0.525f, mapRect.y, 2f, mapRect.height), GUIContent.none);
                    GUI.color = new Color(0.1f, 0.22f, 0.35f);
                    foreach (BusinessSpot spot in FindObjectsOfType<BusinessSpot>())
                    {
                        Vector3 pos = spot.transform.position;
                        float markerX = mapRect.x + Mathf.Clamp01((pos.x + 40f) / 80f) * (mapRect.width - 82f);
                        float markerY = mapRect.y + Mathf.Clamp01((20f - pos.z) / 40f) * (mapRect.height - 30f);
                        if (GUI.Button(new Rect(markerX, markerY, 82f, 28f), spot.BusinessName))
                        {
                            selectedDestination = spot;
                            notice = "Destination set: " + spot.BusinessName + ". Follow the NAV distance display.";
                        }
                    }
                    GUI.color = Color.white;
                    y += 270f;
                    GUI.Label(new Rect(x, y, w, 48f), "Tap a storefront marker for its category. Move through the district to discover businesses."); y += 54f;
                    if (GUI.Button(new Rect(x, y, w, 44f), "Return to city")) activePhoneApp = "Home";
                }
                else if (activePhoneApp == "Social")
                {
                    GUI.Label(new Rect(x, y, w, 32f), "CITY FEED · LOCAL"); y += 34f;
                    GUI.Label(new Rect(x, y, w, 24f), "What's happening in Lagos?");
                    socialDraft = GUI.TextArea(new Rect(x, y + 26f, w, 78f), socialDraft); y += 112f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Publish post"))
                    {
                        string message = socialDraft.Trim();
                        if (message.Length == 0) notice = "Write something before publishing.";
                        else
                        {
                            save.posts.Insert(0, new SocialPost { author = "You", message = message });
                            socialDraft = "";
                            notice = "Post published to your local city feed.";
                            Save();
                        }
                    }
                    y += 54f;
                    GUI.Label(new Rect(x, y, w, 28f), "FEED (" + save.posts.Count + ")");
                    y += 30f;
                    for (int p = 0; p < save.posts.Count; p++)
                    {
                        SocialPost post = save.posts[p];
                        GUI.Box(new Rect(x, y, w, 118f + post.replies.Count * 26f), GUIContent.none);
                        GUI.Label(new Rect(x + 8f, y + 6f, w - 16f, 22f), post.author + " · Lagos Life");
                        GUI.Label(new Rect(x + 8f, y + 30f, w - 16f, 42f), post.message);
                        if (GUI.Button(new Rect(x + 8f, y + 76f, (w - 20f) * 0.48f, 32f), "♥ Like (" + post.likes + ")"))
                        {
                            post.likes++;
                            Save();
                            notice = "You liked the post in your local feed.";
                        }
                        if (GUI.Button(new Rect(x + 12f + (w - 20f) * 0.52f, y + 76f, (w - 20f) * 0.48f, 32f), "Reply (" + post.replies.Count + ")"))
                            replyTarget = p;
                        float replyY = y + 118f;
                        for (int r = 0; r < post.replies.Count; r++)
                        {
                            GUI.Label(new Rect(x + 12f, replyY, w - 20f, 24f), "↳ You: " + post.replies[r]);
                            replyY += 26f;
                        }
                        y += 128f + post.replies.Count * 26f;
                        if (replyTarget == p)
                        {
                            GUI.Label(new Rect(x, y, w, 24f), "Write a reply");
                            socialReplyDraft = GUI.TextArea(new Rect(x, y + 24f, w, 56f), socialReplyDraft); y += 86f;
                            if (GUI.Button(new Rect(x, y, w * 0.48f, 36f), "Send reply"))
                            {
                                string reply = socialReplyDraft.Trim();
                                if (reply.Length > 0)
                                {
                                    post.replies.Add(reply);
                                    socialReplyDraft = "";
                                    replyTarget = -1;
                                    notice = "Reply added to the local feed.";
                                    Save();
                                }
                            }
                            if (GUI.Button(new Rect(x + w * 0.52f, y, w * 0.48f, 36f), "Cancel")) { replyTarget = -1; socialReplyDraft = ""; }
                            y += 44f;
                        }
                    }
                    if (save.posts.Count == 0) GUI.Label(new Rect(x, y, w, 48f), "No posts yet. Publish the first city update.");
                }
                else if (activePhoneApp == "Settings")
                {
                    GUI.Label(new Rect(x, y, w, 30f), "PHONE SETTINGS"); y += 34f;
                    GUI.Label(new Rect(x, y, w, 52f), "Display: responsive\nOrientation: portrait / landscape"); y += 58f;
                    GUI.Label(new Rect(x, y, w, 28f), "Graphics quality: " + QualitySettings.names[QualitySettings.GetQualityLevel()]); y += 32f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Change graphics quality"))
                    {
                        int nextQuality = (QualitySettings.GetQualityLevel() + 1) % QualitySettings.names.Length;
                        QualitySettings.SetQualityLevel(nextQuality, true);
                        notice = "Graphics quality set to " + QualitySettings.names[nextQuality] + ".";
                    }
                    y += 50f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Save game")) { Save(); notice = "Saved."; }
                }
                else if (activePhoneApp == "Jobs")
                {
                    GUI.Label(new Rect(x, y, w, 34f), "LAGOS JOB BOARD"); y += 40f;
                    GUI.Label(new Rect(x, y, w, 38f), "Career earnings: ₦" + save.jobEarnings.ToString("N0")); y += 42f;
                    GUI.Box(new Rect(x, y, w, 76f), "District delivery shift\nComplete a simple local prototype shift to earn ₦5,000."); y += 86f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Work shift · Earn ₦5,000"))
                    {
                        if (save.energy < 15f) notice = "You need more energy before taking a shift.";
                        else { save.cash += 5000; save.jobEarnings += 5000; save.energy = Mathf.Clamp(save.energy - 15f, 0f, 100f); Save(); notice = "Shift completed. ₦5,000 added to your wallet."; }
                    }
                    y += 50f;
                    GUI.Box(new Rect(x, y, w, 84f), "Business staff\nCompanies hire staff from the Business app.\nStaff hiring costs ₦10,000 each."); y += 94f;
                    GUI.Box(new Rect(x, y, w, 84f), "Street opportunities\nExplore the district and discover storefronts.\nRegister a company to earn passive income."); y += 94f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Open Business app")) activePhoneApp = "Business";
                }
                else if (activePhoneApp == "Cars")
                {
                    GUI.Label(new Rect(x, y, w, 34f), "VEHICLE GARAGE"); y += 40f;
                    GUI.Box(new Rect(x, y, w, 84f), nearbyCar != null ? (nearbyCar.IsOccupied ? "You are driving a nearby vehicle.\nUse EXIT CAR to leave." : "A vehicle is nearby.\nUse ENTER CAR to drive.") : "No vehicle nearby.\nExplore Lagos to find a ride."); y += 94f;
                    GUI.Label(new Rect(x, y, w, 48f), "Driving controls: use the on-screen directional pad.\nVehicles are part of the local prototype.");
                }
                else if (activePhoneApp == "Profile")
                {
                    GUI.Label(new Rect(x, y, w, 34f), "PLAYER PROFILE"); y += 40f;
                    GUI.Box(new Rect(x, y, w, 152f), "Lagos Resident\nWallet: ₦" + save.cash.ToString("N0") + "\nOwned companies: " + save.businesses.Count + "\nCity feed posts: " + save.posts.Count + "\nEnergy: " + save.energy.ToString("0") + "  Hunger: " + save.hunger.ToString("0") + "\nHygiene: " + save.hygiene.ToString("0") + "  Fun: " + save.fun.ToString("0")); y += 162f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Rest at home · Restore energy")) { save.energy = Mathf.Clamp(save.energy + 35f, 0f, 100f); save.fun = Mathf.Clamp(save.fun + 10f, 0f, 100f); Save(); notice = "You rested. Energy restored."; }
                    y += 50f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Eat a meal · ₦1,500")) { if (save.cash < 1500) notice = "Not enough money for a meal."; else { save.cash -= 1500; save.hunger = Mathf.Clamp(save.hunger + 35f, 0f, 100f); Save(); notice = "Meal purchased. Hunger reduced."; } }
                    y += 50f;
                    if (GUI.Button(new Rect(x, y, w, 42f), "Save profile")) { Save(); notice = "Profile progress saved on this device."; }
                }
                else
                {
                    GUI.Label(new Rect(x, y, w, 70f), activePhoneApp + " app\nThis screen is being expanded in the Unity prototype.");
                }
                GUI.EndScrollView();
            }

            GUI.color = new Color(0.08f, 0.1f, 0.14f);
            if (GUI.Button(new Rect(screen.center.x - 42f, screen.yMax - 32f, 84f, 24f), "● HOME"))
                activePhoneApp = "Home";
            GUI.color = Color.white;
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
                    if (save.posts == null) save.posts = new List<SocialPost>();
                }
            }
            catch (Exception e) { Debug.LogWarning("Citygame load failed: " + e.Message); }
        }
    }
}
