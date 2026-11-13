import { describe, expect, it } from "vitest";
import { FUEL_START, HULL_START, WIN_DISTANCE } from "../constants.ts";
import type { GameState } from "../types.ts";
import {
  advanceRunClock,
  canStartRun,
  connectedPlayerCount,
  evaluateOutcome,
  isRunOver,
  newJourney,
  returnToLobby,
  startRun,
} from "./phases.ts";
import { makeItem, makePlayer, makeState } from "./testState.ts";

const lobby = (ids: string[]): GameState => makeState({ phase: "lobby" }, ids);
const withJourney = (state: GameState, journey: Partial<GameState["journey"]>): GameState => ({
  ...state,
  journey: { ...state.journey, ...journey },
});

describe("starting a run", () => {
  it("needs two to four connected players", () => {
    expect(canStartRun(lobby(["a"]))).toBe(false);
    expect(canStartRun(lobby(["a", "b"]))).toBe(true);
    expect(canStartRun(lobby(["a", "b", "c", "d"]))).toBe(true);
    expect(canStartRun(lobby(["a", "b", "c", "d", "e"]))).toBe(false);
  });

  it("does not count disconnected players", () => {
    const state = lobby(["a", "b"]);
    const dropped: GameState = { ...state, players: { ...state.players, b: makePlayer("b", { connected: false }) } };
    expect(connectedPlayerCount(dropped)).toBe(1);
    expect(canStartRun(dropped)).toBe(false);
    expect(startRun(dropped)).toBe(dropped);
  });

  it("moves from the lobby to playing with a fresh journey and no hazards", () => {
    const stale = withJourney({ ...lobby(["a", "b"]), time: 99 }, { fuel: 3, hull: 4, distance: 500 });
    const started = startRun(stale);
    expect(started.phase).toBe("playing");
    expect(started.time).toBe(0);
    expect(started.hazards).toEqual({});
    expect(started.journey).toEqual(newJourney());
    expect(started.journey).toMatchObject({ fuel: FUEL_START, hull: HULL_START, distance: 0 });
  });

  it("only starts from the lobby", () => {
    for (const phase of ["playing", "won", "lost"] as const) {
      const state = makeState({ phase });
      expect(startRun(state)).toBe(state);
    }
  });
});

describe("ending a run", () => {
  it("is won when the train reaches the destination", () => {
    expect(evaluateOutcome(withJourney(makeState(), { distance: WIN_DISTANCE - 1 })).phase).toBe("playing");
    expect(evaluateOutcome(withJourney(makeState(), { distance: WIN_DISTANCE })).phase).toBe("won");
  });

  it("is lost when the hull reaches zero", () => {
    expect(evaluateOutcome(withJourney(makeState(), { hull: 0.1 })).phase).toBe("playing");
    expect(evaluateOutcome(withJourney(makeState(), { hull: 0 })).phase).toBe("lost");
  });

  it("counts arriving first when both happen on the same step", () => {
    expect(evaluateOutcome(withJourney(makeState(), { distance: WIN_DISTANCE, hull: 0 })).phase).toBe("won");
  });

  it("is only decided while playing, and stays decided", () => {
    const finished = withJourney(makeState({ phase: "lost" }), { distance: WIN_DISTANCE });
    expect(evaluateOutcome(finished)).toBe(finished);
    const waiting = withJourney(makeState({ phase: "lobby" }), { hull: 0 });
    expect(evaluateOutcome(waiting)).toBe(waiting);
    expect(isRunOver(makeState({ phase: "won" }))).toBe(true);
    expect(isRunOver(makeState({ phase: "lost" }))).toBe(true);
    expect(isRunOver(makeState({ phase: "playing" }))).toBe(false);
  });
});

describe("run clock", () => {
  it("advances only while playing", () => {
    expect(advanceRunClock(makeState(), 0.05).time).toBeCloseTo(0.05);
    for (const phase of ["lobby", "won", "lost"] as const) {
      expect(advanceRunClock(makeState({ phase }), 0.05).time).toBe(0);
    }
  });
});

describe("play again", () => {
  it("returns a finished run to the lobby with the same crew, empty hands and a fresh journey", () => {
    const base = makeState({ phase: "lost", time: 120 });
    const finished: GameState = withJourney(
      {
        ...base,
        players: { ...base.players, p1: makePlayer("p1", { heldItem: "wrench-1" }) },
        items: { "wrench-1": makeItem("wrench-1", "wrench", { heldBy: "p1" }) },
        hazards: {
          "hazard-1": {
            id: "hazard-1",
            kind: "fire",
            car: 0,
            spotId: "engine",
            position: { x: 0, y: 0 },
            age: 5,
            progress: 0,
            countdown: null,
          },
        },
      },
      { hull: 0, fuel: 10, distance: 900 },
    );
    const again = returnToLobby(finished);
    expect(again.phase).toBe("lobby");
    expect(again.time).toBe(0);
    expect(again.hazards).toEqual({});
    expect(again.journey).toEqual(newJourney());
    expect(Object.keys(again.players)).toEqual(["p1", "p2"]);
    expect(again.players.p1?.heldItem).toBeNull();
    expect(again.items["wrench-1"]?.heldBy).toBeNull();
    expect(canStartRun(again)).toBe(true);
  });

  it("does nothing while a run is still being played", () => {
    const playing = makeState();
    expect(returnToLobby(playing)).toBe(playing);
  });
});

describe("a whole run", () => {
  it("goes lobby, playing, won, lobby without changing earlier states", () => {
    const start = lobby(["a", "b", "c"]);
    const snapshot = structuredClone(start);
    const playing = startRun(start);
    const arrived = evaluateOutcome(withJourney(playing, { distance: WIN_DISTANCE }));
    const back = returnToLobby(arrived);
    expect([start.phase, playing.phase, arrived.phase, back.phase]).toEqual(["lobby", "playing", "won", "lobby"]);
    expect(start).toEqual(snapshot);
  });
});
