# Deploying a game: what has to be true

For the game teams, the platform team and their AI coding agents. It says how a deployed game is put together, what each game's client has to do so it finds its server, and where each game stands. Checked on 2026-11-14 against `development`.

## How a deployed game runs

One Railway service runs one game. `railway.json` at the repository root does two things with the `GAME` variable (for example `team-3`):

| Step | Command | Result |
|---|---|---|
| Build | `pnpm --filter "./games/$GAME" run build` | Vite builds the game's client into `dist/` (or `client/dist/`) |
| Start | `pnpm --filter "./games/$GAME" run server` | `startGameServer()` from `@sdm/host` starts Colyseus and Express on `$PORT` |

The host then serves **everything from one address**:

- the built client (`index.html` and its assets), from `$CLIENT_DIR`, or `./dist`, or `./client/dist`, whichever holds an `index.html`;
- `GET /health`, `POST /api/rooms/join`, replays, bug reports, stats;
- the game rooms, over WebSocket.

So in a deployment **the page and the server share one address and one port**. That is different from local development, where Vite serves the page on `:5173` and the game server listens on `:2567`.

## The rule for every client

> A client must never assume the server is on port 2567. Port 2567 is only right on the Vite dev server.

A deployed page that looks for `:2567` cannot connect: Railway exposes one port, and it is not that one. The page loads, the lobby shows, and creating or joining a room fails.

Use the platform helper, which picks the right address by itself:

```ts
import { serverAddress } from "@sdm/core/client";

const server = serverAddress(window.location, import.meta.env.VITE_SERVER_URL);
// server.http for fetch(), server.ws for new Client()
```

| Situation | Address it returns |
|---|---|
| `VITE_SERVER_URL` (or any configured address) is set | that address |
| Vite dev server (`pnpm dev`) | `http://<hostname>:2567` |
| Production build, served by the game server | the page's own origin and folder |

It tells the dev server from a production build with Vite's `import.meta.env.DEV`, so there is nothing to pass.

**Every connection the client opens has to use that one address**: the game room, the join route, and any other room the game registers (a lobby room, for example). Do not build the address a second time somewhere else in the client.

A game that keeps its own address function must follow the same three cases.

## Where each game stands (2026-11-14)

Each game was built and started the way `railway.json` does it, on a spare port, with `APP_ENV=production`:

| Check | Team 1 | Team 2 | Team 3 |
|---|---|---|---|
| Client builds | yes | yes | yes |
| Server starts, `/health` answers | yes | yes | yes |
| The game's page is served at the server's address | yes | yes | yes |
| A room can be created over WebSocket | yes | yes | yes |
| The built client looks for the server at its own address | yes | game room yes, lobby no | yes, on `Team_3_Feature` |

- **Team 1**: uses `serverAddress` from `@sdm/core/client`. Nothing to do.
- **Team 2**: the game room uses the helper, but `client/lobby.ts` builds the lobby's address itself and hard-codes `:2567`. Every match starts in the lobby, so a deployed game cannot be played until that is fixed. Tracked in [#302: The lobby looks for the server on port 2567 and cannot connect once the game is deployed](https://github.com/ferenc-munde/sdm2026-2/issues/302).
- **Team 3**: has its own `serverAddress` in `client/roomConnection.ts`. Since #281 it uses port 2567 only on the Vite dev server and the page's own address otherwise (#303, closed). The fix is on `Team_3_Feature`; it reaches `development` with the team's next promotion.

The last row was read from the built bundles; nobody has yet opened a deployed game in two browsers.

## Checklist before a game is deployed

In the game's folder:

1. `pnpm run build` works and leaves an `index.html` in `dist/` or `client/dist/`.
2. `pnpm run server` starts the game, and `http://localhost:2567/health` answers.
3. Open **the server's own address** (`http://localhost:2567`, not the Vite address): the game's page loads, and creating a room and joining it by code from a second tab both work. This is the local stand-in for a deployment, and it is the step that catches a hard-coded port.
4. Search the client for `2567`: it should not appear outside comments, tests and documentation.

On Railway (platform team only, see the repository rules):

5. One service per game, with `GAME` set to the game's folder name. Without it the build stops on purpose with "set the GAME variable".
6. `APP_ENV=production`. Without it the server reports `env: "local"` and debug commands stay switched on.
7. `GET <address>/health` shows the expected commit in `sha`.

## Not built yet

- **One address for all games.** There is no gateway, and each game's page loads its assets from the root (`/assets/...`), so a game does not work under `/team-N/` yet. For now each game gets its own Railway address. To serve a game under a path later, its Vite config needs `base: "./"` so the asset links become relative; `serverAddress` already handles the path.
- **Persistent replays and bug reports.** They are kept in memory and are lost when the service restarts.
- **Deploying from `development`.** Railway deploys `main`, so a fix reaches the deployed game only after it has been promoted: `Team_N_Feature` → `development` → `staging` → `main`.
