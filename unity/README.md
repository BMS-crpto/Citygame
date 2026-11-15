# Citygame Unity Playable Prototype

This is the parallel Unity 6 migration workspace for Citygame. The existing browser game in `public/` and `server.js` remains preserved.

## Included prototype systems
- Third-person capsule controller: keyboard walk, sprint, jump plus on-screen touch directional controls and jump button.
- Follow camera.
- Procedurally generated Lagos-inspired greybox street with named landmark/business spots.
- Business registration when close to a spot (₦150,000 fee).
- Hire staff (₦10,000 each, max 10 per owned business).
- Prototype business revenue credited on a 20-second interval.
- Local JSON save/load for wallet, business roster, staff and accumulated revenue.
- Phone-style company management overlay with selectable owned companies, category/staff details, hire controls and save button.
- Street-front interaction markers for business registration.
- Three greybox parked cars with enter/exit interaction, basic steering/throttle controls, camera target switching and touchscreen driving.
- Eight simple moving sidewalk pedestrians to make the block feel populated.

## Engine and target
- Unity 6 editor baseline: 6000.0.32f1
- Initial target: Android/mobile; editor desktop for development

## Setup
1. Install Unity Hub and Unity 6 editor with Android Build Support (SDK/NDK + OpenJDK).
2. Open the repository's `unity/` directory as a Unity project.
3. Wait for imports and scripts to compile.
4. Use **Citygame > Create Foundation Scene** from the editor menu.
5. Press Play. Walk to the named greybox businesses and open the Business menu to register/hire.

## Controls
- Keyboard: WASD or arrow keys; Shift to sprint; Space to jump.
- Touch: on-screen directional pad, Jump, and nearby vehicle Enter/Exit button and touch steering/throttle while seated.
- Vehicles: enter with the on-screen button, drive with WASD/arrows, press E to exit.
- Tab toggles the management overlay; the overlay also has a touch button.
- Wallet and business data save to `Application.persistentDataPath/citygame-unity-save.json`.

## Important scope
This is a playable greybox prototype foundation, not a complete production open-world game. The Unity workspace does not yet contain ported online multiplayer/accounts, cloud persistence, realistic Lagos building/character/vehicle assets, advanced traffic/vehicle physics, detailed pedestrian AI and animation, full phone/social apps, production UI, or a generated Android APK. The current GitHub workflow tests the browser project and does not compile Unity C#; a Unity editor/device build is still required for verification. The browser game is unchanged and remains the current deployed experience unless a separate Unity build is created and deployed.
