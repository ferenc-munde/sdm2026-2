
 // The Last Train (Team 1) on the real platform host (issue #240): a server on a free port and two
// real clients. The first half uses the platform's connection helper directly; the second half
// goes through the client's own adapters (client/room-adapters.ts), as the browser does.
import { afterEach, describe, expect, it } from "vitest";
import { hostRoom, joinRoomByCode, type GameConnection, type ServerAddress } from "@sdm/core/client";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import config from "../config/game.json";
import { SECTIONS, sectionAt } from "../shared/train-layout";
import { createRoomAdapters, type RoomAdapters } from "../client/room-adapters";
import type { SessionEvent } from "../client/session-adapter.mjs";
import { GAME_ID, type TrainInput, type TrainState } from "../shared/game";
import { rooms } from "./index";

type Connection = GameConnection<TrainState, TrainInput>;

let server: TestServer | undefined;
const connections: Connection[] = [];
const adapters: RoomAdapters[] = [];

async function boot(overrides: Record<string, unknown> = {}): Promise<ServerAddress> {
  server = await startTestServer({ gameId: GAME_ID, config: { ...config, ...overrides }, rooms });
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

function track(connection: Connection): Connection {
  connections.push(connection);
  return connection;
}

function client(address: ServerAddress): RoomAdapters {
  const created = createRoomAdapters(address);
  adapters.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(adapters.splice(0).map((entry) => entry.session.leaveSession().catch(() => undefined)));
  await Promise.all(connections.splice(0).map((connection) => connection.leave().catch(() => undefined)));
  await server?.shutdown();
  server = undefined;
});

describe("team-1 room on the platform host", () => {
  it("creates a room, joins it by code with a name, and both clients see both players", async () => {
    const address = await boot();
    const host = track(await hostRoom<TrainState, TrainInput>(address, { name: "Ada" }));
    const code = await waitFor(() => host.code());
    expect(code).toHaveLength(4);

    const guest = track(await joinRoomByCode<TrainState, TrainInput>(address, code.toLowerCase(), { name: "Bo" }));
    await waitFor(() => host.state().players?.size === 2 && guest.state().players?.size === 2);

    for (const connection of [host, guest]) {
      expect(connection.state().players.get(host.sessionId)?.name).toBe("Ada");
      expect(connection.state().players.get(guest.sessionId)?.name).toBe("Bo");
      expect(connection.state().phase).toBe("lobby");
      expect(connection.state().code).toBe(code);
    }
    expect(host.state().players.get(host.sessionId)?.color).not.toBe(host.state().players.get(guest.sessionId)?.color);
    expect(host.state().seats.size).toBe(2);
  });

  it("rejects a join without a valid name", async () => {
    const address = await boot();
    const host = track(await hostRoom<TrainState, TrainInput>(address, { name: "Ada" }));
    const code = await waitFor(() => host.code());
    await expect(joinRoomByCode(address, code, { name: "   " })).rejects.toMatchObject({ reason: "rejected" });
    await expect(joinRoomByCode(address, code, {})).rejects.toMatchObject({ reason: "rejected" });
    await expect(hostRoom(address, { name: "x".repeat(19) })).rejects.toMatchObject({ reason: "rejected" });
    expect(host.state().players.size).toBe(1);
  });

  it("starts the countdown on `start` and moves a player on the server on `move`", async () => {
    const address = await boot({ roundSeconds: 60 });
    const host = track(await hostRoom<TrainState, TrainInput>(address, { name: "Ada" }));
    const code = await waitFor(() => host.code());
    const guest = track(await joinRoomByCode<TrainState, TrainInput>(address, code, { name: "Bo" }));
    await waitFor(() => host.state().players?.size === 2 && guest.state().players?.size === 2);
    const hostPlayer = () => guest.state().players.get(host.sessionId);
    const guestPlayer = () => host.state().players.get(guest.sessionId);
    const startX = hostPlayer()?.x ?? Number.NaN;
    const guestStartX = guestPlayer()?.x ?? Number.NaN;
    expect(host.state().secondsRemaining).toBe(60);

    // The clock does not run in the lobby.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(host.state().runTicks).toBe(0);

    guest.send({ type: "start" });
    await waitFor(() => host.state().phase === "playing" && guest.state().phase === "playing");

    host.send({ type: "move", x: 1, z: 0 });
    // The other client sees the host's new position: it came from the server.
    await waitFor(() => (hostPlayer()?.x ?? 0) > startX + 0.05);
    host.send({ type: "move", x: 0, z: 0 });
    expect(guestPlayer()?.x).toBe(guestStartX);
    expect(hostPlayer()?.z).toBe(0.5);

    await waitFor(() => host.state().secondsRemaining < 60, 3000);
    expect(host.state().runTicks).toBeGreaterThan(0);
  });

  it("repairs the task in the player's section and wins when it is the only one", async () => {
    const address = await boot({ taskCount: 1, repairStep: 100 });
    const host = track(await hostRoom<TrainState, TrainInput>(address, { name: "Ada" }));
    await waitFor(() => host.code());
    host.send({ type: "start" });
    await waitFor(() => host.state().phase === "playing");
    const task = await waitFor(() => host.state().tasks.at(0));

    // Move into the exact section first, then stop before sending a repair action.
    let currentSection = sectionAt(host.state().players.get(host.sessionId)?.x ?? 0.18);
    const targetIndex = SECTIONS.indexOf(task.section as (typeof SECTIONS)[number]);
    while (currentSection !== task.section) {
      const currentIndex = SECTIONS.indexOf(currentSection);
      host.send({ type: "move", x: targetIndex > currentIndex ? 1 : -1, z: 0 });
      await waitFor(
        () => sectionAt(host.state().players.get(host.sessionId)?.x ?? 0.18) === task.section,
        8000,
      );
      host.send({ type: "move", x: 0, z: 0 });
      await waitFor(() => host.state().players.get(host.sessionId)?.moveX === 0);
      currentSection = task.section as (typeof SECTIONS)[number];
    }

    // Brake calibration deliberately rejects generic repair input. Follow the task's
    // actual interaction contract so random task selection cannot make this test hang.
    const actions: TrainInput[] =
      task.id === "brakes"
        ? [
            { type: "brake-calibrate", action: "apply-pressure" },
            { type: "brake-calibrate", action: "hold-pressure" },
            { type: "brake-calibrate", action: "release-pressure" },
          ]
        : [{ type: "repair" }];

    for (const [index, action] of actions.entries()) {
      host.send(action);
      const expectedProgress = task.id === "brakes" ? [33, 67, 100][index] : 100;
      await waitFor(() => host.state().tasks.at(0)?.progress === expectedProgress);
    }

    await waitFor(() => host.state().phase === "victory");
    expect(host.state().tasks.at(0)?.progress).toBe(100);
    expect(host.state().phase).toBe("victory");
  }, 12000);

  it("syncs progress for all five section repairs and wins only after the last repair", async () => {
    const address = await boot({ roundSeconds: 60, taskCount: 5, repairStep: 50 });
    const host = track(await hostRoom<TrainState, TrainInput>(address, { name: "Ada" }));
    const code = await waitFor(() => host.code());
    const guest = track(await joinRoomByCode<TrainState, TrainInput>(address, code, { name: "Bo" }));
    await waitFor(() => host.state().players?.size === 2 && guest.state().players?.size === 2);

    host.send({ type: "start" });
    await waitFor(() => host.state().phase === "playing" && guest.state().phase === "playing");

    expect(host.state().tasks).toHaveLength(5);
    expect(host.state().tasks.find((task) => task.id === "instruments")?.section).toBe("control");
    expect(host.state().tasks.find((task) => task.id === "passenger-lights")?.section).toBe("passenger");

    for (const task of host.state().tasks) {
      let currentSection = sectionAt(host.state().players.get(host.sessionId)?.x ?? 0.18);
      const targetIndex = SECTIONS.indexOf(task.section as (typeof SECTIONS)[number]);

      // Move the host player into the section containing the current task.
      while (currentSection !== task.section) {
        const currentIndex = SECTIONS.indexOf(currentSection);
        host.send({ type: "move", x: targetIndex > currentIndex ? 1 : -1, z: 0 });

        await waitFor(
          () => sectionAt(host.state().players.get(host.sessionId)?.x ?? 0.18) === task.section,
          5000,
        );

        host.send({ type: "move", x: 0, z: 0 });
        currentSection = task.section as (typeof SECTIONS)[number];
      }

      // Brake calibration uses its own ordered three-action sequence.
      // All other tasks continue to use the generic repair input.
      const taskActions: Array<{ input: TrainInput; progress: number }> =
        task.id === "brakes"
          ? [
              { input: { type: "brake-calibrate", action: "apply-pressure" }, progress: 33 },
              { input: { type: "brake-calibrate", action: "hold-pressure" }, progress: 67 },
              { input: { type: "brake-calibrate", action: "release-pressure" }, progress: 100 },
            ]
          : [
              { input: { type: "repair" }, progress: 50 },
              { input: { type: "repair" }, progress: 100 },
            ];

      for (const action of taskActions) {
        host.send(action.input);

        // The host receives the authoritative progress update.
        await waitFor(
          () => host.state().tasks.find((entry) => entry.id === task.id)?.progress === action.progress,
        );

        // The guest must receive the same authoritative progress update.
        await waitFor(
          () => guest.state().tasks.find((entry) => entry.id === task.id)?.progress === action.progress,
        );
      }
    }

    await waitFor(() => host.state().phase === "victory" && guest.state().phase === "victory");

    expect([...host.state().tasks].every((task) => task.progress === 100)).toBe(true);
    expect([...guest.state().tasks].every((task) => task.progress === 100)).toBe(true);
  }, 30000);
});

describe("team-1 client adapters against the platform host", () => {
  it("creates and joins a session, reports roster events, and maps the room to snapshots", async () => {
    const address = await boot();
    const host = client(address);
    const guest = client(address);
    const hostEvents: SessionEvent[] = [];
    host.session.subscribe((event) => hostEvents.push(event));

    const hosted = await host.session.createSession("  Night   Engineer ");
    expect(hosted.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(hosted.players).toEqual([{ id: hosted.playerId, name: "Night Engineer", connected: true }]);
    await expect(host.session.createSession("Again")).rejects.toMatchObject({ code: "ALREADY_IN_SESSION" });

    const joined = await guest.session.joinSession(hosted.code.toLowerCase(), "Signal Keeper");
    expect(joined.code).toBe(hosted.code);
    expect(joined.players.map((player) => player.name)).toEqual(["Night Engineer", "Signal Keeper"]);
    await waitFor(() => hostEvents.length === 1);
    expect(hostEvents[0]).toEqual({ type: "player-joined", player: { id: joined.playerId, name: "Signal Keeper", connected: true } });

    const lobby = host.game.getSnapshot();
    expect(lobby).toMatchObject({ connectionState: "connected", phase: "lobby", secondsRemaining: config.roundSeconds });
    expect(lobby.players.map((player) => player.id)).toEqual([hosted.playerId, joined.playerId]);
    expect(lobby.repairs).toEqual({ completed: 0, total: config.taskCount });

    // "Board the train" on one client starts the run for both.
    const guestPhases: Array<string | undefined> = [];
    guest.game.subscribe((snapshot) => guestPhases.push(snapshot.phase));
    host.game.sendInput({ type: "start" });
    await waitFor(() => guest.game.getSnapshot().phase === "playing");
    expect(guestPhases).toContain("playing");

    // Keyboard movement is an input; the position both clients see comes back from the server.
    const before = guest.game.getSnapshot().players[0]?.position.x ?? Number.NaN;
    host.game.sendInput({ type: "move", x: 1, z: 0 });
    await waitFor(() => (guest.game.getSnapshot().players[0]?.position.x ?? 0) > before + 0.05);
    host.game.sendInput({ type: "move", x: 0, z: 0 });

    await guest.session.leaveSession();
    await waitFor(() => hostEvents.length === 2);
    expect(hostEvents[1]).toMatchObject({ type: "player-left", player: { name: "Signal Keeper" } });
    expect(host.game.getSnapshot().players).toHaveLength(1);
    expect(guest.game.getSnapshot().connectionState).toBe("disconnected");
  });

  it("maps an unknown code, a full room and a bad name to the lobby's errors", async () => {
    const address = await boot({ maxPlayers: 1 });
    const host = client(address);
    const guest = client(address);
    await expect(guest.session.joinSession("ZZZZ", "Bo")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const hosted = await host.session.createSession("Ada");
    await expect(guest.session.joinSession(hosted.code, "Bo")).rejects.toMatchObject({ code: "SESSION_FULL" });
    await expect(guest.session.joinSession(hosted.code, "")).rejects.toMatchObject({ code: "INVALID_NAME" });

    // A failed join leaves the adapter free to try again.
    await host.session.leaveSession();
    const again = await guest.session.createSession("Bo");
    expect(again.players).toHaveLength(1);
  });

  it("tells the client when the server goes away", async () => {
    const address = await boot({ reconnectSeconds: 0 });
    const host = client(address);
    await host.session.createSession("Ada");
    const states: string[] = [];
    host.game.subscribe((snapshot) => states.push(snapshot.connectionState));
    await server?.shutdown();
    server = undefined;
    await waitFor(() => states.includes("disconnected") || states.includes("reconnecting"), 6000);
    expect(host.game.getSnapshot().connectionState).not.toBe("connected");
  }, 10000);
});
