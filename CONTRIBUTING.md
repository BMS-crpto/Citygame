# Contributing to Lagos Life

## Before changing code
1. Read `README.md` and `HANDOFF.md`.
2. Keep existing gameplay and mobile controls working.
3. Prefer focused modules over adding more logic to the large HTML entry point.
4. Do not commit credentials, account data, save files, or private environment files.

## Local checks
- Node.js 18 or newer
- `npm run check` — syntax-check server and browser JavaScript
- `npm test` — run the HTTP smoke test

## Change discipline
- Keep server and browser responsibilities separate.
- Use the existing shared building definitions when adding destinations.
- Test on a phone-sized viewport as well as desktop when changing UI.
- Update documentation when adding environment variables or setup steps.
- Keep commits small and describe the actual change.
