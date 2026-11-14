import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@colyseus/sdk";
import { type } from "@colyseus/schema";
import { z } from "zod";
import { MESSAGES, ReplaySchema } from "@sdm/core/shared";
import { runReplay } from "@sdm/core/server";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import {
  BUG_REPORTS_PER_MINUTE,
  MAX_INVALID_INPUTS_IN_A_ROW,
  RateLimiter,
  TokenBucket,
  createGameRoom,
  GAME_ROOM_NAME,
} from "../src";
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
};

const config = { tickRate: 30, patchRate: 30, maxPlayers: 2, reconnectSeconds: 0 };

let running: TestServer | undefined;
const folders: string[] = [];

async function boot(game: GameDefinition<any, any, any, any> = counter, extra: { clientDir?: string } = {}) {
  running = await startTestServer({
    gameId: game.id,
    config,
    rooms: { [GAME_ROOM_NAME]: (deps) => createGameRoom(game, deps) },
    ...extra,
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

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

afterEach(async () => {
  await running?.shutdown();
  running = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("replays", () => {
  it("serves the replay of a live room and of a closed one, and the replay re-runs to the same state", async () => {
    const server = await boot();
    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    const state = room.state as { total: number };
    room.send(MESSAGES.input, { seq: 1, input: { add: 4 } });
    room.send(MESSAGES.input, { seq: 2, input: { add: 5 } });
    await waitFor(() => state.total === 9);

    const live = ReplaySchema.parse(await (await fetch(`${server.url}/api/replays/${room.roomId}`)).json());
    expect(live.game).toBe("counter");
    expect(live.events.map((event) => event.type)).toEqual(["join", "input", "input"]);
    expect(runReplay(counter, live).matches).toBe(true);

    await room.leave();
    await waitFor(() => server.logs.some((line) => line.message === "room disposed"));
    const closed = ReplaySchema.parse(await (await fetch(`${server.url}/api/replays/${room.roomId}`)).json());
    expect(closed.events.map((event) => event.type)).toEqual(["join", "input", "input", "leave"]);
    const result = runReplay(counter, closed);
    expect(result.matches).toBe(true);
    expect((result.state as CounterState).total).toBe(9);
  });

  it("answers 404 for an unknown room", async () => {
    const server = await boot();
    expect((await fetch(`${server.url}/api/replays/nope`)).status).toBe(404);
  });

  it("logs the replay address when the game crashes, and keeps the replay", async () => {
    const crashing: GameDefinition<CounterState, RoomSettings, z.infer<typeof InputSchema>> = {
      ...counter,
      id: "crashing",
      step(state, inputs) {
        if (inputs.length > 0) throw new Error("boom");
        state.total += 1;
      },
    };
    const server = await boot(crashing);
    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    room.send(MESSAGES.input, { seq: 1, input: { add: 1 } });
    await waitFor(() => server.logs.some((line) => line.message === "game step failed"));
    const failure = server.logs.find((line) => line.message === "game step failed");
    expect(failure).toMatchObject({ roomId: room.roomId, replay: `/api/replays/${room.roomId}` });
    await waitFor(() => server.logs.some((line) => line.message === "room disposed"));
    expect((await fetch(`${server.url}${failure!.replay}`)).status).toBe(200);
  });
});

describe("bug reports", () => {
  it("stores a report with a copy of the room's replay", async () => {
    const server = await boot();
    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    room.send(MESSAGES.input, { seq: 1, input: { add: 2 } });
    await waitFor(() => (room.state as { total: number }).total === 2);

    const created = await fetch(`${server.url}/api/bug-reports`, json({ roomId: room.roomId, message: "the counter jumped" }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const report = (await (await fetch(`${server.url}/api/bug-reports/${id}`)).json()) as Record<string, any>;
    expect(report).toMatchObject({ id, roomId: room.roomId, message: "the counter jumped" });
    expect(ReplaySchema.parse(report.replay).events.map((event) => event.type)).toEqual(["join", "input"]);
    await room.leave();
  });

  it("accepts a report without a room, rejects an invalid one and answers 404 for an unknown id", async () => {
    const server = await boot();
    expect((await fetch(`${server.url}/api/bug-reports`, json({ message: "general" }))).status).toBe(201);
    expect((await fetch(`${server.url}/api/bug-reports`, json({ message: "" }))).status).toBe(400);
    expect((await fetch(`${server.url}/api/bug-reports`, json({}))).status).toBe(400);
    expect((await fetch(`${server.url}/api/bug-reports/missing`)).status).toBe(404);
  });

  it("limits the reports per client address", async () => {
    const server = await boot();
    for (let i = 0; i < BUG_REPORTS_PER_MINUTE; i++) {
      expect((await fetch(`${server.url}/api/bug-reports`, json({ message: `report ${i}` }))).status).toBe(201);
    }
    expect((await fetch(`${server.url}/api/bug-reports`, json({ message: "one too many" }))).status).toBe(429);
  });
});

describe("stats", () => {
  it("reports the process and every live room", async () => {
    const server = await boot();
    const idle = (await (await fetch(`${server.url}/api/stats`)).json()) as Record<string, any>;
    expect(idle.rooms).toEqual([]);
    expect(idle.process).toMatchObject({ rooms: 0, players: 0 });

    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    room.send(MESSAGES.input, { seq: 1, input: { add: 1 } });
    await waitFor(() => (room.state as { total: number }).total === 1);
    const busy = (await (await fetch(`${server.url}/api/stats`)).json()) as Record<string, any>;
    expect(busy.process).toMatchObject({ rooms: 1, players: 1 });
    expect(busy.process.memory.rssMb).toBeGreaterThan(0);
    expect(busy.rooms[0]).toMatchObject({ roomId: room.roomId, players: 1, inputsApplied: 1, inputsRejected: 0 });
    expect(busy.rooms[0].ticks).toBeGreaterThan(0);
    await room.leave();
  });
});

describe("input handling", () => {
  it("answers a bad input with a notice and keeps the player in the room", async () => {
    const server = await boot();
    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    const state = room.state as { total: number };
    const notices: unknown[] = [];
    room.onMessage(MESSAGES.notice, (notice) => notices.push(notice));

    room.send(MESSAGES.input, { seq: 1, input: { add: 99 } });
    await waitFor(() => notices.length === 1);
    expect(notices[0]).toEqual({ error: "invalid input" });
    room.send(MESSAGES.input, { seq: 1, input: { add: 2 } });
    await waitFor(() => state.total === 2);
    await room.leave();
  });

  it("removes a player who keeps sending bad inputs", async () => {
    const server = await boot();
    const room = await new Client(server.url.replace("http", "ws")).create(GAME_ROOM_NAME);
    for (let i = 0; i < MAX_INVALID_INPUTS_IN_A_ROW; i++) room.send(MESSAGES.input, { seq: 1, input: { add: 99 } });
    await waitFor(() => server.logs.some((line) => line.message === "player left"));
  });
});

describe("serving the built client", () => {
  it("serves index.html from the client folder", async () => {
    const folder = mkdtempSync(join(tmpdir(), "sdm-client-"));
    folders.push(folder);
    writeFileSync(join(folder, "index.html"), "<h1>the game</h1>");
    const server = await boot(counter, { clientDir: folder });
    const page = await fetch(`${server.url}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("the game");
    expect(server.logs.find((line) => line.message === "server listening")).toMatchObject({ clientDir: folder });
    expect((await fetch(`${server.url}/health`)).status).toBe(200);
  });

  it("serves nothing when there is no client folder", async () => {
    const folder = mkdtempSync(join(tmpdir(), "sdm-empty-"));
    folders.push(folder);
    const server = await boot(counter, { clientDir: folder });
    expect((await fetch(`${server.url}/`)).status).toBe(404);
  });
});

describe("limits", () => {
  it("lets a token bucket refill over time", () => {
    let now = 0;
    const bucket = new TokenBucket(2, () => now);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
    now = 500;
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it("allows a limited number of hits per window and key", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a"), limiter.allow("b")]).toEqual([true, true, false, true]);
    now = 1001;
    expect(limiter.allow("a")).toBe(true);
  });
});
