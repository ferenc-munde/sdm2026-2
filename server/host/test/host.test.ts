import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@colyseus/sdk";
import { type } from "@colyseus/schema";
import { Room } from "colyseus";
import { z } from "zod";
import { MESSAGES } from "@sdm/core/shared";
import { hostRoom, joinRoomByCode } from "@sdm/core/client";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import { createGameRoom, GAME_ROOM_NAME } from "../src";
import { startTestServer, type TestServer } from "../src/testing";

class CounterState extends BaseState {
  @type("number") total = 0;
}

class MatchmakingRoom extends Room {
  onCreate(_options: { teamSize: number }) {
    this.maxClients = 4;
    this.setState(new CounterState());
  }
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

  it("filters joinOrCreate rooms by registered options", async () => {
    running = await startTestServer({
      gameId: "matchmaking",
      config,
      env: "local",
      rooms: {
        lobby: {
          room: () => MatchmakingRoom,
          filterBy: ["teamSize"],
          sortBy: { createdAt: 1 },
        },
      },
    });

    const client = new Client(running.url.replace("http", "ws"));
    const smallCrew = await client.joinOrCreate("lobby", { teamSize: 2 });
    const largeCrew = await client.joinOrCreate("lobby", { teamSize: 3 });
    const anotherSmallCrew = await client.joinOrCreate("lobby", { teamSize: 2 });

    expect(largeCrew.roomId).not.toBe(smallCrew.roomId);
    expect(anotherSmallCrew.roomId).toBe(smallCrew.roomId);
    await Promise.all([smallCrew.leave(), largeCrew.leave(), anotherSmallCrew.leave()]);
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

class CrewState extends BaseState {
  @type("string") names = "";
  @type("number") bonus = 0;
}

const CrewConfigSchema = RoomSettingsSchema.extend({ bonus: z.number().int() });
const JoinSchema = z.object({ name: z.string().min(1, "a name is required").max(12) });

const crew: GameDefinition<CrewState, z.infer<typeof CrewConfigSchema>, unknown, z.infer<typeof JoinSchema>> = {
  id: "crew",
  configSchema: CrewConfigSchema,
  inputSchema: z.unknown(),
  joinOptionsSchema: JoinSchema,
  createState: () => new CrewState(),
  init() {},
  join(state, _playerId, _ctx, options) {
    state.names = state.names ? `${state.names},${options.name}` : options.name;
  },
  leave() {},
  step(state, _inputs, ctx) {
    state.bonus = ctx.config.bonus;
  },
};

async function bootCrew(env: "local" | "production" = "local") {
  running = await startTestServer({
    gameId: "crew",
    config: { ...config, bonus: 7 },
    env,
    rooms: { [GAME_ROOM_NAME]: (deps) => createGameRoom(crew, deps) },
  });
  return { ...running, address: { http: running.url, ws: running.url.replace("http", "ws") } };
}

describe("@sdm/host join options, config and the client helper", () => {
  it("passes checked join options to the game and the config to every step", async () => {
    const server = await bootCrew();
    const host = await hostRoom<CrewState>(server.address, { name: "Ada" });
    await waitFor(() => host.code().length === 4);
    const guest = await joinRoomByCode<CrewState>(server.address, host.code().toLowerCase(), { name: "Bo" });
    await waitFor(() => host.state().names === "Ada,Bo" && host.state().bonus === 7);
    expect(guest.sessionId).not.toBe(host.sessionId);
    expect(host.state().seats.size).toBe(2);
    await guest.leave();
    await host.leave();
  });

  it("rejects a join whose options fail the game's schema, and keeps the room usable", async () => {
    const server = await bootCrew();
    const host = await hostRoom<CrewState>(server.address, { name: "Ada" });
    await waitFor(() => host.code().length === 4);
    await expect(joinRoomByCode(server.address, host.code(), { name: "" })).rejects.toMatchObject({
      name: "JoinError",
      reason: "rejected",
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(host.state().seats.size).toBe(1);
    expect(host.state().names).toBe("Ada");
    await host.leave();
  });

  it("reports an unknown code and a full room through JoinError", async () => {
    const server = await bootCrew();
    await expect(joinRoomByCode(server.address, "ZZZZ", { name: "Bo" })).rejects.toMatchObject({ reason: "roomNotFound" });
    const host = await hostRoom<CrewState>(server.address, { name: "Ada" });
    await waitFor(() => host.code().length === 4);
    const second = await joinRoomByCode<CrewState>(server.address, host.code(), { name: "Bo" });
    await expect(joinRoomByCode(server.address, host.code(), { name: "Cy" })).rejects.toMatchObject({ reason: "roomFull" });
    await second.leave();
    await host.leave();
  });

  it("wraps inputs in the envelope with a rising sequence number", async () => {
    const server = await boot();
    const address = { http: server.url, ws: server.url.replace("http", "ws") };
    const connection = await hostRoom<CounterState, { add: number }>(address);
    connection.send({ add: 2 });
    connection.send({ add: 4 });
    await waitFor(() => connection.state().total === 6);
    await connection.leave();
  });

  it("lets a page on another origin call the join route outside production", async () => {
    const server = await bootCrew();
    const origin = "http://localhost:5173";
    const preflight = await fetch(`${server.url}/api/rooms/join`, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get("access-control-allow-origin")).toBeTruthy();
    expect(preflight.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
    const post = await fetch(`${server.url}/api/rooms/join`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ" }),
    });
    expect(post.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});
