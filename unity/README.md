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
- Phone-style company management overlay with selectable owned companies, paginated roster (all registered businesses can be browsed), category/staff details, hire controls and save button.
- Street-front interaction markers for business registration.
- Three greybox parked cars with enter/exit interaction, basic steering/throttle controls, collision-aware Rigidbody movement, camera target switching and touchscreen driving.
- Eight simple moving sidewalk pedestrians to make the block feel populated.
- Dynamic 24-hour Lagos day/night cycle with changing sun direction, daylight intensity, ambient lighting, atmospheric fog and a live clock on the HUD (15-minute full game day).

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

### GLB asset pipeline

- Unity glTFast `com.unity.cloud.gltfast` 6.21.0 is enabled for Unity 6 GLB import.
- The CC0 corner-shop model is mirrored at `Assets/Resources/CitygameModels/loja_esquina.glb` so it can be imported as a Unity asset and loaded through `Resources` at runtime.
- Source: `kayquer/kit-cidade-lowpoly`, `models/comercial/loja_esquina.glb`, CC0 1.0 Universal. The same model is used by the browser build at `public/assets/glb/city-kit/loja_esquina.glb`.
## Real Lagos map data (OpenStreetMap)

The Unity scene checks for `Assets/Resources/LagosMapData.json` and imports coordinate-based roads, building footprints, water/coastline geometry and parks when that file exists. Roads are generated as mesh surfaces with colliders for driving. The old procedural blocks are retained only as a clearly logged fallback; they are not presented as real Lagos geography.

### Build the first real Lagos region

The initial extract covers Lagos Island, Ikoyi, Victoria Island and western Lekki. From the repository root:

```bash
python tools/download_lagos_osm.py /tmp/lagos-core.geojson
python tools/convert_lagos_osm.py /tmp/lagos-core.geojson unity/Assets/Resources/LagosMapData.json
```

The downloader uses the read-only Overpass API and defaults to a focused bounding box. To choose another small area, pass `south west north east` (maximum 0.25 degrees per side), for example:

```bash
python tools/download_lagos_osm.py /tmp/lagos-area.geojson 6.40 3.30 6.60 3.55
python tools/convert_lagos_osm.py /tmp/lagos-area.geojson unity/Assets/Resources/LagosMapData.json
```

Then reopen Unity and choose **Citygame > Create Foundation Scene**. The converter projects longitude/latitude into local metres around central Lagos (6.5244, 3.3792). Building heights use OSM height/level tags where available and conservative fallbacks otherwise.

### Data and licensing

OpenStreetMap data is licensed under the Open Data Commons Open Database License (ODbL). Preserve the attribution **© OpenStreetMap contributors** in the game credits and comply with ODbL obligations when distributing a database derived from the extract. Public Overpass instances are shared infrastructure: keep extracts focused, cache downloaded data, and do not run repeated bulk queries. For larger production-scale coverage, use a regional extract or a dedicated data provider.

**Current limitation:** the extract is not committed to the repository yet. The downloader and converter are now included, but Unity will continue to use the greybox fallback until `LagosMapData.json` has been generated and placed in `Assets/Resources`. OSM geometry is a geographic foundation, not photorealistic 3D art; detailed facades, interiors, traffic and landmark models remain separate production work.
