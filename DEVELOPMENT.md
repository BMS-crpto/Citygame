# Development

## Requirements
- Node.js 18 or newer
- npm (included with Node.js)

## Run locally
```sh
npm install
npm start
```

The project currently has no third-party Node dependencies, so `npm install` does not need to download application packages.

## Check JavaScript syntax
```sh
npm run check
```

Or run the portable shell script directly:

```sh
sh scripts/check.sh
```

GitHub Actions runs the same server and browser-JavaScript syntax checks on pushes and pull requests to `main`.

## Project layout
- `server.js` — Node.js multiplayer server
- `public/index.html` — browser game entry point
- `public/*.js` — separate game systems
- `public/models/` — 3D model assets
- `scripts/` — developer maintenance scripts
- `.github/workflows/` — automated repository checks
