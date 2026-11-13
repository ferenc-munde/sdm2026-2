import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@colyseus/sdk";
import { type } from "@colyseus/schema";
import { z } from "zod";
import { MESSAGES } from "@sdm/core/shared";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import { createGameRoom, GAME_ROOM_NAME } from "../src";
import { startTestServer, type TestServer } from "../src/testing";

class CounterState extends BaseState {
  @type("number") total = 0;
}

const InputSchema = z.object({ add: z.number().int().min(0).max(10) });

const counter: GameDefinition<CounterState, RoomSettings, z.infer<typeof InputSchema>> = {
  id: "counter",
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

const config = { tickRate: 30, patchRate: 30, maxPlayers: 2, reconnectSeconds: 0 };

let running: TestServer | undefined;

async function boot(env: "local" | "production" = "local") {
  running = await startTestServer({
    gameId: "counter",
    config,
    env,
    rooms: { [GAME_ROOM_NAME]: (deps) => createGameRoom(counter, deps) },
  });
  return running;
}

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

afterEach(async () => {
  await running?.shutdown();
  running = undefined;
});

describe("@sdm/host", () => {
  it("answers /health with the environment", async () => {
    const server = await boot();
    const body = await (await fetch(`${server.url}/health`)).json();
    expect(body).toMatchObject({ ok: true, env: "local", sha: "unknown" });
  });

  it("creates a room with a code and joins it by code", async () => {
    const server = await boot();
    const client = new Client(server.url.replace("http", "ws"));
    const room = await client.create(GAME_ROOM_NAME);
    await waitFor(() => Boolean((room.state as { code?: string }).code));
    const code = (room.state as { code: string }).code;
    expect(code).toHaveLength(4);

    const joined = await fetch(`${server.url}/api/rooms/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ roomId: room.roomId });

    const unknown = await fetch(`${server.url}/api/rooms/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ" }),
    });
    expect(unknown.status).toBe(404);
    await room.leave();
  });

  it("applies validated inputs on the server and ignores repeated sequence numbers", async () => {
    const server = await boot();
    const client = new Client(server.url.replace("http", "ws"));
    const room = await client.create(GAME_ROOM_NAME);
    const state = room.state as { total: number };

    room.send(MESSAGES.input, { seq: 1, input: { add: 3 } });
    room.send(MESSAGES.input, { seq: 1, input: { add: 3 } });
    await waitFor(() => state.total === 3);
    await new Promise((r) => setTimeout(r, 150));
    expect(state.total).toBe(3);
    await room.leave();
  });

  it("runs debug commands outside production only", async () => {
    const server = await boot();
    const client = new Client(server.url.replace("http", "ws"));
    const room = await client.create(GAME_ROOM_NAME);
    const state = room.state as { total: number };
    room.send(MESSAGES.input, { seq: 1, input: { add: 5 } });
    await waitFor(() => state.total === 5);
    room.send(MESSAGES.debug, { name: "reset" });
    await waitFor(() => state.total === 0);
    await room.leave();
  });

  it("rejects debug commands in production", async () => {
    const server = await boot("production");
    const client = new Client(server.url.replace("http", "ws"));
    const room = await client.create(GAME_ROOM_NAME);
    const state = room.state as { total: number };
    const notices: unknown[] = [];
    room.onMessage(MESSAGES.notice, (n) => notices.push(n));
    room.send(MESSAGES.input, { seq: 1, input: { add: 5 } });
    await waitFor(() => state.total === 5);
    room.send(MESSAGES.debug, { name: "reset" });
    await waitFor(() => notices.length === 1);
    expect(state.total).toBe(5);
    await room.leave();
  });
});
