# Citygame Unity Foundation

This is the Unity migration workspace for Citygame. The existing browser game in `public/` and `server.js` remains intact while the Unity foundation is built in parallel.

## Engine
- Unity 6 (6000.0 LTS line)
- Initial target: Android/mobile; desktop editor for development
- Runtime code is organized by gameplay domain under `Assets/Scripts`

## Setup
1. Install Unity Hub and a Unity 6 editor with Android Build Support (SDK/NDK + OpenJDK).
2. Open the repository's `unity/` directory as a Unity project.
3. Wait for package import.
4. In Unity, use **Citygame > Create Foundation Scene** to create a playable greybox scene.
5. Press Play to test the third-person movement foundation.

## Migration approach
The browser game is not automatically converted. This workspace is a parallel native-engine foundation. Systems will be ported in stages: character/camera, Lagos world and addressable assets, interactions/buildings, business/economy, phone UI, then networking and persistence. Do not claim the Unity build is production-ready until built and device-tested.

## Current scaffold limitations
- Greybox scene uses a primitive floor and capsule player.
- Movement uses Unity's legacy Input Manager axes (Horizontal/Vertical); configure active input handling accordingly if your editor is set to Input System only.
- Multiplayer, account synchronization, business persistence, Lagos assets and production UI are not yet ported.
