import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createHttpServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@colyseus/sdk";
import { type } from "@colyseus/schema";
import { z } from "zod";
import { MESSAGES, ROUTES } from "@sdm/core/shared";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import { createGameRoom, GAME_ROOM_NAME } from "@sdm/host";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import { createGateway, splitGamePath } from "../src";

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

const config = { tickRate: 30, patchRate: 30, maxPlayers: 4, reconnectSeconds: 0 };

const games: TestServer[] = [];
const gateways: Server[] = [];
const folders: string[] = [];
const fakes: Server[] = [];

/** A game server on a free port that serves a one-line client page. */
async function startGame(page: string): Promise<TestServer> {
  const folder = mkdtempSync(join(tmpdir(), "sdm-gateway-"));
  folders.push(folder);
  writeFileSync(join(folder, "index.html"), page);
  const game = await startTestServer({
    gameId: "counter",
    config,
    clientDir: folder,
    rooms: { [GAME_ROOM_NAME]: (deps) => createGameRoom(counter, deps) },
  });
  games.push(game);
  return game;
}

/** A stand-in for a game: answers every request with its own name and the path and headers it was asked for. */
async function fakeGame(name: string): Promise<{ url: string }> {
  const server = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json", "x-game": name });
      res.end(JSON.stringify({ game: name, method: req.method, url: req.url, host: req.headers.host, forwarded: req.headers["x-forwarded-for"] ?? null, body }));
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) => server.listen(port, resolve));
  fakes.push(server);
  return { url: `http://localhost:${port}` };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/** A gateway in front of the given games (name → server), on a free port. */
async function startGateway(upstreams: Record<string, string>, planned: string[] = []) {
  const gateway = createGateway({
    games: Object.keys(upstreams),
    planned,
    upstream: (game) => new URL(upstreams[game]!),
  });
  const port = await freePort();
  await new Promise<void>((resolve) => gateway.listen(port, resolve));
  gateways.push(gateway);
  return { url: `http://localhost:${port}`, ws: `ws://localhost:${port}` };
}

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

afterEach(async () => {
  for (const gateway of gateways.splice(0)) {
    gateway.closeAllConnections();
    await new Promise((resolve) => gateway.close(resolve));
  }
  for (const fake of fakes.splice(0)) {
    fake.closeAllConnections();
    await new Promise((resolve) => fake.close(resolve));
  }
  for (const game of games.splice(0)) await game.shutdown();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("splitGamePath", () => {
  it("splits the game from the rest of the path and keeps the query", () => {
    expect(splitGamePath("/team-1")).toEqual({ game: "team-1", rest: "" });
    expect(splitGamePath("/team-1/")).toEqual({ game: "team-1", rest: "/" });
    expect(splitGamePath("/team-1/api/rooms/join?x=1")).toEqual({ game: "team-1", rest: "/api/rooms/join?x=1" });
    expect(splitGamePath("/team-1?x=1")).toEqual({ game: "team-1", rest: "/?x=1" });
    expect(splitGamePath("/")).toBeUndefined();
    expect(splitGamePath("/%E0%A4%A")).toBeUndefined();
  });
});

describe("the gateway itself", () => {
  it("answers /health and lists the games, marking the planned ones", async () => {
    const one = await startGame("one");
    const gateway = await startGateway({ "team-1": one.url }, ["team-4"]);
    expect(await (await fetch(`${gateway.url}/health`)).json()).toEqual({ ok: true });
    const index = await (await fetch(gateway.url)).text();
    expect(index).toContain("<title>SDM Game Network - Choose Your Departure</title>");
    expect(index).toContain('<a class="route-card" href="/team-1/"');
    expect(index).toContain("TEAM 01");
    expect(index).toContain("COMING SOON");
    expect(index).toContain("Team 4");
    expect(index).toContain('aria-label="Team 4, coming soon"');
    expect(index).not.toContain('href="/team-4/"');
  });

  it("redirects /<game> to /<game>/ and answers 404 for anything else", async () => {
    const one = await startGame("one");
    const gateway = await startGateway({ "team-1": one.url }, ["team-4"]);
    const redirect = await fetch(`${gateway.url}/team-1`, { redirect: "manual" });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/team-1/");
    expect((await fetch(`${gateway.url}/nope/`)).status).toBe(404);
    expect((await fetch(`${gateway.url}/team-4/`)).status).toBe(404);
  });

  it("answers 502 when a game cannot be reached, and keeps serving the others", async () => {
    const one = await startGame("one");
    const deadPort = await freePort();
    const gateway = await startGateway({ "team-1": one.url, "team-2": `http://localhost:${deadPort}` });
    expect((await fetch(`${gateway.url}/team-2/health`)).status).toBe(502);
    expect((await fetch(`${gateway.url}/team-1/health`)).status).toBe(200);
  });
});

describe("proxying a game under its path", () => {
  it("sends each path to its own game, without the prefix and with the query string", async () => {
    const one = await fakeGame("one");
    const two = await fakeGame("two");
    const gateway = await startGateway({ "team-1": one.url, "team-2": two.url });
    const first = await (await fetch(`${gateway.url}/team-1/some/path?x=1&y=2`)).json();
    const second = await (await fetch(`${gateway.url}/team-2/`)).json();
    expect(first).toMatchObject({ game: "one", url: "/some/path?x=1&y=2" });
    expect(second).toMatchObject({ game: "two", url: "/" });
  });

  it("gives the game its own host name, keeps the client address header and passes the body on", async () => {
    const one = await fakeGame("one");
    const gateway = await startGateway({ "team-1": one.url });
    const answer = (await (
      await fetch(`${gateway.url}/team-1/api/bug-reports`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ message: "hello" }),
      })
    ).json()) as Record<string, unknown>;
    expect(answer).toMatchObject({ method: "POST", url: "/api/bug-reports", forwarded: "203.0.113.9", body: '{"message":"hello"}' });
    expect(answer.host).toBe(new URL(one.url).host);
  });

  it("serves the game's built client page through its path", async () => {
    const one = await startGame("<h1>game one</h1>");
    const gateway = await startGateway({ "team-1": one.url });
    expect(await (await fetch(`${gateway.url}/team-1/`)).text()).toContain("game one");
  });

  it("passes the platform routes through, with the request body", async () => {
    const one = await startGame("one");
    const gateway = await startGateway({ "team-1": one.url });
    const unknown = await fetch(`${gateway.url}/team-1${ROUTES.joinRoom}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ" }),
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown room code" });
  });

  it("plays a game through the gateway: create a room, join it by code, send inputs over the WebSocket", async () => {
    const one = await startGame("one");
    const gateway = await startGateway({ "team-1": one.url });

    const host = await new Client(`${gateway.ws}/team-1`).create(GAME_ROOM_NAME);
    await waitFor(() => Boolean((host.state as { code?: string }).code));
    const code = (host.state as { code: string }).code;

    const joined = await fetch(`${gateway.url}/team-1${ROUTES.joinRoom}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(joined.status).toBe(200);
    const { roomId } = (await joined.json()) as { roomId: string };
    expect(roomId).toBe(host.roomId);

    const guest = await new Client(`${gateway.ws}/team-1`).joinById(roomId);
    host.send(MESSAGES.input, { seq: 1, input: { add: 4 } });
    guest.send(MESSAGES.input, { seq: 1, input: { add: 5 } });
    await waitFor(() => (host.state as { total: number }).total === 9 && (guest.state as { total: number }).total === 9);
    await guest.leave();
    await host.leave();
  });
});
