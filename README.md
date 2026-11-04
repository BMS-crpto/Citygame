# City Life Online

A multiplayer 3D Lagos-style life sim that runs in the browser (desktop and phone).
Pick a path (nepo baby or lapo babe), work shifts, rent a home, buy cars at the Elite Auto Gallery, ride with friends, and survive NEPA.

The server has **no npm dependencies** (Node built-ins only). The client is a single page using Three.js r128 from a CDN.

## Run it

```bash
node server.js
# open http://localhost:3000 and share a room code
```

Needs Node 18+. Progress is saved to `saves.json` and `accounts.json` next to the server (both git-ignored).

## Deploy (Render)

`render.yaml` is ready. Render's free disk is wiped on every restart, so for permanent accounts add a free
[Upstash Redis](https://upstash.com) database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

| Env var | What it does |
| --- | --- |
| `PORT` | HTTP port (default 3000) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Permanent storage for accounts, progress and rented homes |
| `GOOGLE_CLIENT_ID` | Enables Google sign-in (server verifies the ID token) |
| `ACC_FILE`, `SAVE_FILE` | Override the JSON file locations |
| `AUTH_LIMIT` | Login/register attempts per IP per minute |
| `WORK_CD_MS` | Shift cooldown in ms (default 30000) |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | TURN server for voice chat (WebRTC) |

## Controls

- Move: `WASD` or arrow keys (on-screen joystick on phones)
- Camera: `Q` / `E`
- Everything else (use, action, phone, quick-chat, get out of car) is an on-screen button

## What's in it

- Needs: energy, hunger, hygiene, fun. Hit zero hunger or energy and you collapse into hospital
- Two life paths with their own goals; Lapo babes get 60% of every bill paid by Daddy
- Careers with shifts, experience and promotions, delivery jobs, a bank with interest, missions
- Rentable houses and penthouses with interiors you can decorate and paint
- Elite Auto Gallery with 15 vehicles, phone marketplace, shared delivery lot, passengers (up to 3 riders)
- Taxis, danfo, keke, okada and private jets between places
- NEPA outages, rain, weekdays, police and thieves, quick-chat and proximity voice

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Game server: HTTP, WebSocket, accounts, saves, economy, all game rules |
| `public/index.html` | The whole client (Three.js scene, UI, phone) |
| `public/buildings.js` | Shared building list and types, used by both server and browser |
| `public/models/` | `.glb` models (cars, people, props) |
| `HANDOFF.md` | Current status and known gaps |

## Tuning the economy

In `server.js`: `INCOME_MULT` (pay multiplier), `START` (starting cash per path), `DADDY` (Lapo discount).
The nepo "empire" mission goal is 5x `START.nepo`, so change them together.
