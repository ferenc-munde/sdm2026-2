# `@sdm/core`

The platform's shared code. Four entry points, each importable on its own:

| Entry point | Folder | Runs in | What goes in it |
|---|---|---|---|
| `@sdm/core/shared` | `src/shared/` | browser and server | **The contract**: `env` (`AppEnv`, `HealthResponse`, `isDebugEnabled()`), `messages` (WebSocket message names, HTTP routes, input envelope, debug commands, bug reports), `replay` (replay file format), `random` (`SeededRandom`) |
| `@sdm/core/sim` | `src/sim/` | browser and server | **The simulation contract**: `GameDefinition` (`createState`, `init`, `join`, `leave`, `step`, optional `disconnect`/`reconnect`, debug `commands`), `BaseState`, `RoomSettingsSchema` |
| `@sdm/core/server` | `src/server/` | server only | **The Simulation**: applies and records every event, room codes, state hash, replay runner, stats, built-in debug commands |
| `@sdm/core/client` | `src/client/` | browser only | **The client core**: prediction, interpolation, network stats, guest id, URL parameters, debug overlay and console, bug report button |

Rules:

- `shared` and `sim` stay browser-safe: no `colyseus`, no `node:*`.
- A change to `shared` is a breaking change for every game: say in the PR which games are affected.
- Everything in `server` and `sim` is deterministic (see [../CLAUDE.md](../CLAUDE.md#determinism-rules-all-game-code)).

## Connecting a game client (`@sdm/core/client`)

Built so far in `client`: the connection helper. Every game's browser code uses it to create a room, join one by its code and send inputs, instead of writing its own.

```ts
import { hostRoom, joinRoomByCode, serverAddress, JoinError } from "@sdm/core/client";

// `pnpm dev` (Vite): http://<host>:2567. Built and served by the game server: the page's own address.
const server = serverAddress(location, import.meta.env.VITE_SERVER_URL);

// Create a room and take the first seat. The options go to the game's `join` hook.
const connection = await hostRoom<MyState, MyInput>(server, { name: "Ada" });
connection.onState((state) => draw(state)); // every change of the synced state
connection.code();                           // the 4-character code to share
connection.send({ type: "move", dx: 1, dy: 0 }); // wrapped in the { seq, input } envelope for you

// Join by code. Throws a JoinError: roomNotFound | roomFull | rejected | connectionFailed.
try {
  const guest = await joinRoomByCode<MyState, MyInput>(server, "QX7R", { name: "Bo" });
} catch (error) {
  if (error instanceof JoinError) showMessage(error.reason);
}
```

On the game side, declare what a player may send when joining, and read it in `join`:

```ts
export const myGame: GameDefinition<MyState, MyConfig, MyInput, { name: string }> = {
  joinOptionsSchema: z.object({ name: z.string().min(1).max(24) }),
  join(state, playerId, ctx, options) { /* options.name is checked; ctx.config is config/game.json */ },
  step(state, inputs, ctx) { /* ctx.config.<tuning value>, ctx.random */ },
  // ...
};
```

A join whose options fail `joinOptionsSchema` is rejected before a seat is made. A game without `joinOptionsSchema` gets `undefined` as `options`. The host already answers cross-origin requests, so a Vite page on `:5173` can call the join route on `:2567` in local development.
