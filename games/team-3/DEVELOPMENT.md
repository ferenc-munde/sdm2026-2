# Developing The Last Train

## Layout

```
games/team-3/
├─ package.json      @team-3/game
├─ config/game.json  tickRate, patchRate, maxPlayers, reconnectSeconds
├─ shared/           browser-safe game rules, state, inputs and config (pure, tested)
├─ room/             room registration for the platform host
└─ client/           browser code: Three.js scene, input, screens
```

This is the layout of the platform template (`server/template/README.md`). `server.ts`, `index.html` and `vite.config.ts` are added when the platform host and template exist.

## Run the tests

From `games/team-3/`:

```bash
pnpm install
pnpm test
pnpm typecheck
```

Until the root pnpm workspace exists, `npm install`, `npm test` and `npm run typecheck` work the same way. Lockfiles in this folder are ignored on purpose: the workspace lockfile at the repository root will replace them.

## Rules for code in `shared/`

- Pure functions only: the same state, input and elapsed time always give the same result.
- No `Math.random()`: take a random generator as a parameter, so the platform's seeded generator can be passed in.
- No clock (`Date.now()`, `performance.now()`): time advances only through the step's elapsed time.
- No imports from `node:*`, `colyseus` or the DOM, because the client imports these files too.
- Tests sit next to the code as `*.test.ts`.
