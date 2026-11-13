# Developing Last Train (Team 2)

## Layout

```
games/team-2/
├─ package.json      @team-2/game
├─ config/game.json  tickRate, patchRate, maxPlayers, reconnectSeconds, timeLimitSeconds
├─ shared/           browser-safe game rules, state, inputs and config (pure, tested)
├─ room/             room registration for the platform host
└─ client/           browser code: Three.js scene, input, screens
```

This mirrors the platform template layout (`server/template/README.md`).
Until the platform lands (#73, stalled), the client runs on a local dev
harness (team-3's merged precedent): `npm run dev` serves `client/` with
vite and `client/stateModel.ts` drives the real `lastTrain` GameDefinition
headless. That adapter is the swap point — it becomes `net.ts` + schema
callbacks when `@sdm/host` exists; nothing else changes. See `SPEC.md` for
the game design and `WORKFLOW.md` for who owns which files.

`shared/config.ts` mirrors the platform's `RoomSettingsSchema` fields; once
`@sdm/core` lands it will extend it directly instead of redefining them
(tracked with the platform in #73). The tsconfig adds
`experimentalDecorators` + `useDefineForClassFields: false` on top of the
team-3 conventions — required by `@colyseus/schema` state classes in #64.

## Run the tests

From `games/team-2/`:

```bash
npm install
npm test
npm run typecheck
```

We use **npm** for now because that is what the CI runs (`npm ci` /
`npm install` in the team-2 workflow) and there is no root pnpm workspace
yet (`pnpm --filter` cannot resolve without it). When the workspace lands
(platform build-order step 1), commands move to `pnpm --filter @team-2/game
…` and lockfiles are ignored on purpose until then.

## Rules for code in `shared/`

- Pure functions only: the same state, input and elapsed time always give the
  same result.
- No `Math.random()`: take a random generator as a parameter, so the seeded
  generator can be passed in (determinism rules in root `CLAUDE.md`).
- No clock (`Date.now()`, `performance.now()`): time advances only through the
  step's elapsed time / tick counts.
- No imports from `node:*`, the `colyseus` server or the DOM, because the
  client imports these files too.
- Tests sit next to the code as `*.test.ts`.

## Coming next

- The shared contract (state schema, input contract, `GameDefinition`
  wiring) landed in #64 (PR #91). `@colyseus/schema@^5.0.0` is pinned there, paired with
  the Colyseus 0.18 SDK (`colyseus@0.18.12` uses `@colyseus/core@^0.18.10`,
  which pairs with schema 5.x) — the SDK itself joins with the platform host
  (#73). `shared/types.ts` shims `BaseState`/`GameDefinition`/`Rng` until
  `@sdm/core` exists; only that file changes when the platform lands.
- The Three.js renderer starts with #37; the lobby with #70.
