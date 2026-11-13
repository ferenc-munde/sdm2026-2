// Temporary smoke-test server for @sdm/host. NOT part of the repository.
// Boots Colyseus + Express with a tiny "counter" game so you can check that
// the backend runs: GET /health, POST /api/rooms/join and WebSocket rooms.
import { type } from "@colyseus/schema";
import { z } from "zod";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import { createGameRoom, GAME_ROOM_NAME, startGameServer } from "./index";

class CounterState extends BaseState {
  @type("number") total = 0;
}

const InputSchema = z.object({ add: z.number().int().min(0).max(10) });

const counter: GameDefinition<CounterState, RoomSettings, z.infer<typeof InputSchema>> = {
  id: "smoke-counter",
  configSchema: RoomSettingsSchema,
  inputSchema: InputSchema,
  createState: () => new CounterState(),
  init() {},
  join() {},
  leave() {},
  step(state, inputs) {
    for (const { input } of inputs) state.total += input.add;
  },
  commands: {
    reset: (state) => {
      state.total = 0;
    },
  },
};

const config = { tickRate: 20, patchRate: 20, maxPlayers: 4, reconnectSeconds: 30 };

const running = await startGameServer({
  gameId: "smoke-counter",
  config,
  rooms: { [GAME_ROOM_NAME]: (deps) => createGameRoom(counter, deps) },
  sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void running.shutdown().then(() => process.exit(0)));
}
