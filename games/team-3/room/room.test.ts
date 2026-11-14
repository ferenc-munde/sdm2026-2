// The Last Train on the real platform host (#80): a server on a free port, two Colyseus clients,
// joining by code, seeing each other, departing and walking. Uses @sdm/host/testing.

import { afterEach, describe, expect, it } from "vitest";
import { Client, type Room as ClientRoom } from "@colyseus/sdk";
import { GAME_ROOM_NAME } from "@sdm/host";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import { MESSAGES } from "@sdm/core/shared";
import config from "../config/game.json" with { type: "json" };
import { readNotice, readView, type LastTrainState } from "../shared/game.ts";
import { GAME_ID } from "../shared/index.ts";
import type { ClientMessage } from "../shared/messages.ts";
import type { GameState } from "../shared/types.ts";
import { rooms } from "./index.ts";

let server: TestServer | undefined;
const open: ClientRoom[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((room) => room.leave().catch(() => undefined)));
  await server?.shutdown();
  server = undefined;
});

async function boot(): Promise<{ server: TestServer; client: () => Client }> {
  server = await startTestServer({ gameId: GAME_ID, config, rooms });
  const url = server.url.replace("http", "ws");
  return { server, client: () => new Client(url) };
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

/** Sends one game message in the platform's input envelope. */
function sender(room: ClientRoom) {
  let seq = 0;
  return (message: ClientMessage | Record<string, unknown>) => room.send(MESSAGES.input, { seq: ++seq, input: message });
}

const view = (room: ClientRoom): GameState | null => readView(room.state as LastTrainState);

async function joinByCode(server: TestServer, client: Client, code: string): Promise<ClientRoom> {
  const response = await fetch(`${server.url}/api/rooms/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  expect(response.status).toBe(200);
  const { roomId } = (await response.json()) as { roomId: string };
  const room = await client.joinById(roomId);
  open.push(room);
  return room;
}

describe("The Last Train on @sdm/host", () => {
  it("two players join one room by its code, see each other, depart and walk", async () => {
    const { server, client } = await boot();

    const hostRoom = await client().create(GAME_ROOM_NAME);
    open.push(hostRoom);
    const sendHost = sender(hostRoom);
    const code = await waitFor(() => (hostRoom.state as LastTrainState).code);
    expect(code).toHaveLength(4);
    sendHost({ type: "createRoom", name: "Ada" });

    const crewRoom = await joinByCode(server, client(), code);
    const sendCrew = sender(crewRoom);
    sendCrew({ type: "joinRoom", name: "Bo", code });

    // Both browsers see both players on the platform, and the first to join is the host.
    for (const room of [hostRoom, crewRoom]) {
      const state = await waitFor(() => {
        const v = view(room);
        return v && Object.keys(v.players).length === 2 ? v : null;
      });
      expect(state.phase).toBe("lobby");
      expect(Object.values(state.players).map((p) => p.name).sort()).toEqual(["Ada", "Bo"]);
      expect(state.lobby.hostId).toBe(hostRoom.sessionId);
      expect(state.roomCode).toBe(code);
    }

    // Only the host departs; the crew member gets a notice.
    sendCrew({ type: "startGame" });
    const notice = await waitFor(() => readNotice(crewRoom.state as LastTrainState, crewRoom.sessionId));
    expect(notice.error).toBe("notHost");

    sendHost({ type: "configureRoom", crewSize: 2 });
    sendHost({ type: "startGame" });
    // The room counts down 5 s before departing (#385).
    await waitFor(() => view(crewRoom)?.phase === "playing", 9000);

    // Walking on the train is seen by the other browser.
    const before = view(crewRoom)!.players[hostRoom.sessionId]!.position;
    sendHost({ type: "input", direction: { dx: 1, dy: 0 }, interacting: false });
    await waitFor(() => (view(crewRoom)!.players[hostRoom.sessionId]!.position.x > before.x + 5 ? true : null));
  }, 30000);

  it("refuses a malformed message with a notice instead of dropping the player", async () => {
    const { client } = await boot();
    const room = await client().create(GAME_ROOM_NAME);
    open.push(room);
    const send = sender(room);
    send({ type: "teleport", to: "engine" });
    const notice = await waitFor(() => readNotice(room.state as LastTrainState, room.sessionId));
    expect(notice.error).toBe("invalidMessage");
    send({ type: "createRoom", name: "Ada" });
    await waitFor(() => (view(room)?.players[room.sessionId] ? true : null));
  }, 20000);

  it("frees the seat when a player leaves, and hands the host over", async () => {
    const { server, client } = await boot();
    const hostRoom = await client().create(GAME_ROOM_NAME);
    open.push(hostRoom);
    const code = await waitFor(() => (hostRoom.state as LastTrainState).code);
    sender(hostRoom)({ type: "createRoom", name: "Ada" });
    const crewRoom = await joinByCode(server, client(), code);
    sender(crewRoom)({ type: "joinRoom", name: "Bo", code });
    await waitFor(() => (Object.keys(view(crewRoom)?.players ?? {}).length === 2 ? true : null));

    await hostRoom.leave();
    open.splice(open.indexOf(hostRoom), 1);
    const state = await waitFor(() => {
      const v = view(crewRoom);
      return v && Object.keys(v.players).length === 1 ? v : null;
    });
    expect(state.lobby.hostId).toBe(crewRoom.sessionId);
  }, 20000);
});
