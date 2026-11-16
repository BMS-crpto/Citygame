# Citygame — Lagos Life Simulator

Citygame is being rebuilt as a browser-based 3D Lagos life simulation for desktop and mobile. The current rebuild foundation is a modular Three.js client served by a dependency-free Node.js server.

## Current rebuild foundation

- New responsive game shell and Citygame identity.
- Procedurally generated Lagos-inspired districts, roads and named landmarks.
- Third-person player movement with keyboard and touch controls.
- Mobile portrait and landscape layouts.
- In-game city map with searchable destinations, pan, zoom, map markers and GPS destination selection.
- Separate full-screen phone/app views.

## In progress

The new client foundation is not yet a complete life simulator. Persistent player accounts, multiplayer synchronisation, businesses, homes/interiors, careers, social posting, vehicles/traffic, NPC routines and Unity migration require further implementation and verification. Do not treat placeholder app screens as live services.

## Run locally

```bash
node server.js
```

Open `http://localhost:3000`. Node.js 18 or newer is required. The server remains dependency-free.

## Persistence and deployment

The existing server's account and save stores are retained during the rebuild. Existing deployments may use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for persistent storage. Keep these secrets configured in the hosting dashboard; never commit credentials or player data.

## Validation

```bash
npm test
node --check server.js
find public -type f -name '*.js' -print0 | xargs -0 -r -n 1 node --check
```

The Unity Android workflow is separate from the browser game and requires a configured Unity license secret. A successful browser CI run does not prove a Unity build or device test.
