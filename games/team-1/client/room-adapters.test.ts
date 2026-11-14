// The mapping from room state to what the lobby and the HUD expect. No server here;
// room/room.test.ts runs the same adapters against a real one.
import { describe, expect, it } from "vitest";
import { JoinError } from "@sdm/core/client";
import { SeededRandom } from "@sdm/core/shared";
import rawConfig from "../config/game.json";
import { ConfigSchema, lastTrain } from "../shared/game";
import { createRoomAdapters, PlayerMotionTracker, toSessionError, toSnapshot } from "./room-adapters";
import { SessionError } from "./session-adapter.mjs";

function playingState() {
  const ctx = { random: new SeededRandom(3), config: ConfigSchema.parse(rawConfig) };
  const state = lastTrain.createState(ctx.config);
  lastTrain.init(state, ctx);
  lastTrain.join(state, "first", ctx, { name: "Ada" });
  lastTrain.join(state, "second", ctx, { name: "Bo" });
  return { state, ctx };
}

describe("toSnapshot", () => {
  it("returns an empty snapshot before any state arrived", () => {
    const snapshot = toSnapshot(undefined, "connecting");
    expect(snapshot).toMatchObject({ connectionState: "connecting", players: [], tasks: [], phase: "lobby" });
    expect(snapshot.outcome.kind).toBe("playing");
  });

  it("maps players, tasks and the countdown", () => {
    const { state, ctx } = playingState();
    lastTrain.step(state, [{ playerId: "first", input: { type: "start" } }], ctx);
    const task = state.tasks.at(0);
    const other = state.tasks.at(1);
    if (!task || !other) throw new Error("tasks are missing");
    task.progress = 100;
    other.progress = 40;
    lastTrain.disconnect?.(state, "second", ctx);

    const snapshot = toSnapshot(state, "connected", "first");
    expect(snapshot.phase).toBe("playing");
    expect(snapshot.localPlayerId).toBe("first");
    expect(snapshot.secondsRemaining).toBe(ctx.config.roundSeconds);
    expect(snapshot.players).toEqual([
      { id: "first", name: "Ada", connected: true, position: { x: state.players.get("first")?.x, z: 0.5 }, color: "#d6ac68", section: "electrical" },
      { id: "second", name: "Bo", connected: false, position: { x: state.players.get("second")?.x, z: 0.5 }, color: "#8bb8a4", section: "electrical" },
    ]);
    expect(snapshot.repairs).toEqual({ completed: 1, total: 5 });
    expect(snapshot.tasks.map((entry) => entry.status)).toEqual(["complete", "in-progress", "available", "available", "available"]);
    expect(snapshot.tasks[1]).toMatchObject({ id: other.id, label: other.label, progress: 40, section: other.section });
  });

  it("maps the end of a run to an outcome", () => {
    const { state } = playingState();
    state.phase = "victory";
    expect(toSnapshot(state, "connected").outcome.kind).toBe("victory");
    state.phase = "failure";
    expect(toSnapshot(state, "reconnecting")).toMatchObject({ connectionState: "reconnecting", outcome: { kind: "failure" } });
    state.phase = "lobby";
    expect(toSnapshot(state, "connected").outcome.kind).toBe("playing");
  });
});

describe("toSessionError", () => {
  it("maps the platform's join failures to the lobby's error codes", () => {
    expect(toSessionError(new JoinError("roomNotFound")).code).toBe("NOT_FOUND");
    expect(toSessionError(new JoinError("roomFull")).code).toBe("SESSION_FULL");
    expect(toSessionError(new JoinError("rejected")).code).toBe("INVALID_NAME");
    expect(toSessionError(new JoinError("connectionFailed")).code).toBe("CONNECTION_FAILED");
    expect(toSessionError(new Error("anything else")).code).toBe("CONNECTION_FAILED");
    const own = new SessionError("Enter a crew name to continue.", "INVALID_NAME");
    expect(toSessionError(own)).toBe(own);
  });
});

describe("live player motion", () => {
  it("uses actual displacement for walking and retains facing while idle or blocked", () => {
    const { state, ctx } = playingState();
    const tracker = new PlayerMotionTracker();
    const player = state.players.get("first");
    if (!player) throw new Error("player is missing");
    tracker.update(state);
    lastTrain.step(state, [{ playerId: "first", input: { type: "start" } }], ctx);
    tracker.update(state);
    lastTrain.step(state, [{ playerId: "first", input: { type: "move", x: 1, z: 0 } }], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "right", isMoving: true });

    lastTrain.step(state, [{ playerId: "first", input: { type: "move", x: 0, z: 0 } }], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "right", isMoving: false });

    player.x = 1;
    tracker.update(state);
    lastTrain.step(state, [{ playerId: "first", input: { type: "move", x: 1, z: 0 } }], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "right", isMoving: false });

    lastTrain.step(state, [{ playerId: "first", input: { type: "move", x: 0, z: -1 } }], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "up", isMoving: true });
    lastTrain.disconnect?.(state, "first", ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "up", isMoving: false });
  });

  it("does not animate a spawn or a reconnect position jump", () => {
    const { state, ctx } = playingState();
    const tracker = new PlayerMotionTracker();
    tracker.update(state);
    lastTrain.step(state, [{ playerId: "first", input: { type: "start" } }], ctx);
    tracker.update(state);
    tracker.suspend();
    lastTrain.step(state, [{ playerId: "first", input: { type: "move", x: -1, z: 0 } }], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "left", isMoving: false });
    lastTrain.step(state, [], ctx);
    tracker.update(state);
    expect(tracker.get("first")).toMatchObject({ direction: "left", isMoving: true });
  });
});

describe("room adapters without a server", () => {
  // Port 9 (discard) is not a game server; nothing should even be contacted for an empty name.
  const adapters = createRoomAdapters({ http: "http://127.0.0.1:9", ws: "ws://127.0.0.1:9" });

  it("rejects an empty name before connecting", async () => {
    await expect(adapters.session.createSession("   ")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(adapters.session.joinSession("ABCD", "")).rejects.toMatchObject({ code: "INVALID_NAME" });
  });

  it("reports an unreachable server as CONNECTION_FAILED and stays usable", async () => {
    await expect(adapters.session.joinSession("ABCD", "Ada")).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
    expect(adapters.game.getSnapshot().connectionState).toBe("disconnected");
    await expect(adapters.session.leaveSession()).resolves.toBeUndefined();
  });
});
