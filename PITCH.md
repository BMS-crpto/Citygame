# City Life Online: the full pitch

Everything requested so far, in one place. Game: https://github.com/BMS-crpto/Citygame

**The goal in one line:** make it feel like a top-notch, pro 3D Lagos life game, not a basic one with plain buttons.
The reference screenshots (the polish level wanted, and where the game is today) are kept outside the repo in `City-Life-Pitch.zip`.

---

## 1. Everything that was asked for

### A. Interface (looks old, plain buttons)
Make the whole interface look like the target screenshots:
- **Top bar:** one rounded pill with weather and time, mood ("Very Happy"), players online, sound, and money with a + button.
- **Quest chips** under it: Get a job, weekly event steps, streak counter, daily gem hunt.
- **Notification pop-ups** such as "Conductor still has your ₦200 change".
- **Bottom bar:** Home, Buy, Map, plus a phone button with a notification badge.
- **Location card** (for example "University of Lagos") and small **needs bars** beside your avatar.
- **Phone:** gold-framed, with an app grid (Jobs, Messages, Games, Support, Shop, Life, Hustles, Crew, Invest and more).
- **Invest app:** land plots, trailers, businesses, weekly money news (for example a rate hike changing land value).
- **Camera views:** Above, Inside, Eyes. Also Take a photo, Hide buttons, Radio, Go outside.

### B. Chat (looks old)
- The chat button currently opens a plain browser pop-up and messages are dark boxes.
- Wanted: a modern, top-notch chat. Bubbles, names, time, a proper send button, city chat plus private messages, matching the quality of the target game.

### C. Buying: no phone-first shopping
- Everything you buy, you must **see it and buy it right there**: walk to the shelf, stall or car and buy.
- Elite Auto Gallery: the cashier says "open your phone and tell me the car". That is wrong. Walk to the car and buy it.
- The same everywhere (market, pharmacy, supermarket, restaurant menus, a clothing shop where you try clothes on).
- The phone should keep only bank, calls and chat, map, rent and similar.

### D. Houses and interiors
- Houses feel **too small** (parlor and bedroom). Make a **large parlor** and bigger rooms with real distance to walk.
- You must **not be able to walk out of the house** while still "inside". The only way out is the door.
- Entering a house is **slow to display**. Fix the loading.
- Real, good-looking furniture (sofas, chandelier, tiles, TV, ring light as in the target screenshots), not plain boxes.

### E. Visible animations (not just text)
- **Sleeping:** when you sleep, you must **see your character lying in the bed**.
- **Sitting and watching a movie:** you must **see your character sit** and watch, not just get a text saying you sat down and feel good.

### F. The look of the city and the map
- Change the **map** and **every building** to look like trending Lagos life.
- Ideas listed so far: compounds with gates, duplexes, plazas and Lekki-style malls, glass towers, petrol stations, container shops and kiosks, face-me-I-face-you houses, Third Mainland Bridge, Lekki toll gate, Oshodi, Computer Village, Balogun market, Makoko, beach, Eko Atlantic skyline, danfo, keke, okada, go-slow traffic, hawkers, suya spots, generators, billboards, rain.

### G. Family and relationships
- **Every player can have a babe (partner)**, from one real player to another.
- **Marriage / wife.**
- **Have babies** in the game.

### H. Police, crime and danger
- If a player **hits someone**, the **police chase them**.
- **Gangster time:** at certain hours gangsters are outside and **everybody must go indoors**.
- **Area Boys event:** pop-up with choices (Pay ₦200, Talk your way out, Run, Stand your ground), each with a stat check, as in the target screenshot.

### I. A living city
- **NPCs go to work.** The boss is working, others come and go.
- **Other players' characters go to work too**, and the player must be able to **see** all of it happening.

---

## 2. Where the game is today

| Item | Status |
|---|---|
| Every building enterable (367 doors, 13 interior types, furniture, owner NPC, activity) | **Done and browser-tested** (restaurant, club, office, church, market) |
| Repo cleanup (dead server files removed, README rewritten, nepo mission fixed) | Done |
| Bigger Ajah villa (scaled about 2.2x), solid outer walls, quiet preload of the 3.9 MB model | **Coded, not yet tested in a browser** |
| Flat and Lekki Villa interiors (22 x 18, low ceilings) | Not changed yet |
| Modern chat | Not started (old chat code was read, plan ready) |
| Babe / partner system | Not started (plan ready: ask, accept, break up, saved on the account) |
| Interface redesign (A) | Not started |
| Buying in the world (C) | Not started |
| Sleeping / sitting animations (E) | Not started. Character models only have walk and idle clips |
| Police AI, hitting, curfew, Area Boys (H) | Not started. Police today is only a player role that arrests thieves |
| NPC routines (I) | Not started. NPCs stand still |
| Family and babies (G) | Not started |
| Lagos look and map (F) | Not started |

**Nothing is pushed to GitHub.** The session had read-only access. All code changes are in `citygame-changes.patch`
(kept in `City-Life-Pitch.zip`).

## 3. Bugs found along the way
- Inside the Elite Auto Gallery the location banner says "Your Home".
- Gallery car button shows "car ₦0": the price and name do not load for that car.
- The Grand Market cashier line tells you to use the phone to shop.
- Ajah villas: the "eat at home" button appears near the door, but the server expects the fridge at the old position, so eating there likely fails.
- The old interface uses a browser `prompt()` for chat, sending money and shifts.

## 4. Build order recommended
1. Bigger houses, walls, preload, plus visible sleeping, sitting and watching TV.
2. New interface (top bar, bottom bar, phone app grid, camera views) and the new chat.
3. Hitting, police AI chase, jail, then gangster curfew and Area Boys events.
4. NPC and player daily routines (work, home, sleep).
5. Babe, marriage and babies.
6. Buying at the shelf or car.
7. The Lagos look for buildings and the map.

## 5. Honest limits
- The game draws everything from simple 3D shapes in a phone browser. Furniture and city props would come from free open-licence 3D packs from GitHub, not hand-made.
- Sleep and sit animations would be posed in code first (lying on the bed, bent at the hips on the sofa). Smooth animation needs a free animation pack.
- Take the layout and ideas from the target game, but use your own names, art and branding. Do not copy theirs (for example their app names).
- Changing the map moves house doors. Saved accounts, homes and money must keep working.

## 6. Decisions still needed
- Babe and marriage: assumed **any player with any player**. Also with NPCs? How do babies grow up (stay a child, or become a playable character)?
- Gangster hours: real-time clock hours, or in-game night?
- Hitting: should it be a punch button for everyone, or only certain roles?

## 7. Related files
- `HANDOFF.md`: current build status
- `README.md`: how to run and deploy
- `City-Life-Pitch.zip` (kept outside the repo): the screenshots, test renders and the code patch
