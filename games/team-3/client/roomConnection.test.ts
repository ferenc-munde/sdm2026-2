import { afterEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import config from "../config/game.json" with { type: "json" };
import { rooms } from "../room/index.ts";
import { GAME_ID } from "../shared/index.ts";
import {
  createEnvelopes,
  createRoom,
  joinRoomByCode,
  serverAddress,
  type RoomConnection,
  type ServerAddress,
} from "./roomConnection.ts";

describe("serverAddress", () => {
  const page = (url: string) => {
    const u = new URL(url);
    return { protocol: u.protocol, hostname: u.hostname, host: u.host, pathname: u.pathname };
  };

  it("on the dev server, uses port 2567 next to the page", () => {
    expect(serverAddress(page("http://localhost:5173/?room=K7QF"), undefined, true)).toEqual({
      http: "http://localhost:2567",
      ws: "ws://localhost:2567",
    });
  });

  it("when the game server served the page, uses the page's own origin and folder", () => {
    expect(serverAddress(page("https://team3.up.railway.app/"))).toEqual({
      http: "https://team3.up.railway.app",
      ws: "wss://team3.up.railway.app",
    });
    expect(serverAddress(page("https://games.example/team-3/index.html")).ws).toBe("wss://games.example/team-3");
    expect(serverAddress(page("http://localhost:2567/")).http).toBe("http://localhost:2567");
  });

  it("uses a configured address and drops a trailing slash", () => {
    expect(serverAddress(page("http://localhost:5173/"), "https://rooms.example/team-3/", true)).toEqual({
      http: "https://rooms.example/team-3",
      ws: "wss://rooms.example/team-3",
    });
    expect(serverAddress(page("http://x:5173/"), "  ", true).http).toBe("http://x:2567");
  });
});

describe("createEnvelopes", () => {
  it("numbers messages from 1, as the platform requires", () => {
    const envelope = createEnvelopes();
    expect(envelope({ type: "startGame" })).toEqual({ seq: 1, input: { type: "startGame" } });
    expect(envelope({ type: "throw" }).seq).toBe(2);
  });
});

let server: TestServer | undefined;
const open: RoomConnection[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave().catch(() => undefined)));
  await server?.shutdown();
  server = undefined;
});

async function boot(): Promise<ServerAddress> {
  server = await startTestServer({ gameId: GAME_ID, config, rooms });
  return { http: server.url, ws: server.url.replace("http", "ws") };
}

async function waitFor<T>(read: () => T | null | undefined | false, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("a browser connection to the room", () => {
  it("creates a room, joins it by code, and both players see each other", async () => {
    const address = await boot();
    const host = await createRoom(address, "Ada");
    open.push(host);
    const code = await waitFor(() => host.code());

    const joined = await joinRoomByCode(address, code, "Bo");
    if (!joined.ok) throw new Error(joined.error);
    open.push(joined.connection);

    for (const connection of [host, joined.connection]) {
      const state = await waitFor(() => {
        const view = connection.view();
        return view && Object.keys(view.players).length === 2 ? view : null;
      });
      expect(Object.values(state.players).map((p) => p.name).sort()).toEqual(["Ada", "Bo"]);
      expect(state.players[connection.me]).toBeDefined();
    }

    joined.connection.send({ type: "startGame" });
    expect((await waitFor(() => joined.connection.notice())).error).toBe("notHost");
  }, 20000);

  it("reports a wrong code as roomNotFound", async () => {
    const address = await boot();
    expect(await joinRoomByCode(address, "ZZZZ", "Bo")).toEqual({ ok: false, error: "roomNotFound" });
  }, 20000);

  it("reports an unreachable server as connectionFailed", async () => {
    const result = await joinRoomByCode({ http: "http://127.0.0.1:1", ws: "ws://127.0.0.1:1" }, "ABCD", "Bo");
    expect(result).toEqual({ ok: false, error: "connectionFailed" });
  });
});
