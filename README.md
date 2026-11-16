# Citygame — Lagos Life Simulator

Citygame is a browser-based 3D Lagos life simulation for desktop and mobile. The current live entry point remains the existing playable game while a clean modular client is rebuilt alongside it.

## Rebuild preview

Open `/rebuild.html` to inspect the new client foundation:

- Modular responsive game shell and Citygame identity.
- Procedurally generated Lagos-inspired districts, roads and named landmarks.
- Third-person player movement with keyboard and touch controls.
- Portrait and landscape mobile layouts.
- In-game city map with searchable destinations, pan, zoom, map markers and GPS destination selection.
- Separate full-screen phone/app views.

The preview is an early foundation, not yet a replacement for the full game. Existing account, multiplayer, career, business, social, vehicle and property systems are still being migrated. The root `/` route continues to serve the existing playable game during this migration.

## Run locally

```bash
node server.js
```

Open `http://localhost:3000` for the current game or `http://localhost:3000/rebuild.html` for the rebuild preview. Node.js 18 or newer is required.

## Persistence and deployment

The existing server's account and save stores are retained. Existing deployments may use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for persistent storage. Keep secrets in the hosting dashboard; never commit credentials or player data.

## Validation

```bash
npm test
node --check server.js
find public -type f -name '*.js' -print0 | xargs -0 -r -n 1 node --check
```

The Unity Android workflow is separate from the browser game and requires a configured Unity license secret. A successful browser CI run does not prove a Unity build or device test.
