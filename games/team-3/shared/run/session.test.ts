import { describe, expect, it } from "vitest";
import { roomSettings } from "../config.ts";
import { FIRST_HAZARD_SECONDS, TICK_SECONDS, WIN_DISTANCE } from "../constants.ts";
import type { GameState } from "../types.ts";
import type { HazardSpot } from "./director.ts";
import { createSeededRandom } from "./random.ts";
import {
  applyInput,
  cleanPlayerName,
  createSession,
  disconnectFromSession,
  type GameSession,
  inputDirections,
  joinSession,
  leaveSession,
  playAgain,
  type SessionResult,
  startSession,
  type StepSystem,
  stepSession,
} from "./session.ts";

const SPOTS: HazardSpot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `spot-${i}`,
  car: i % 3,
  position: { x: i * 30, y: 10 },
}));

/** Unwraps a result that must have been accepted. */
function ok(result: SessionResult): GameSession {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.session;
}

/** A lobby with `count` players named p1, p2, ... */
function lobbyOf(count: number): GameSession {
  let session = createSession("ABCD");
  for (let i = 1; i <= count; i++) session = ok(joinSession(session, `p${i}`, `Player ${i}`));
  return session;
}

function stepFor(session: GameSession, seconds: number, seed = 1, systems: StepSystem[] = []): GameSession {
  const random = createSeededRandom(seed);
  let current = session;
  for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
    current = stepSession(current, TICK_SECONDS, { spots: SPOTS, random, systems });
  }
  return current;
}

/** A stand-in for the journey model: the train covers `speed` units per second. */
const travel =
  (speed: number): StepSystem =>
  (state: GameState, dt: number) => ({
    ...state,
    journey: { ...state.journey, distance: state.journey.distance + speed * dt },
  });

describe("a new room", () => {
  it("starts empty, in the lobby, with its room code", () => {
    const { state } = createSession("ABCD");
    expect(state).toMatchObject({ roomCode: "ABCD", phase: "lobby", time: 0, players: {}, hazards: {}, items: {} });
  });
});

describe("joining", () => {
  it("adds a connected player with a trimmed name at the spawn point", () => {
    const session = ok(joinSession(createSession("ABCD"), "p1", "  Ada  ", { x: 40, y: 12 }));
    expect(session.state.players.p1).toMatchObject({
      id: "p1",
      name: "Ada",
      position: { x: 40, y: 12 },
      heldItem: null,
      connected: true,
    });
  });

  it("accepts up to four players and refuses a fifth", () => {
    expect(roomSettings.maxPlayers).toBe(4);
    const full = lobbyOf(4);
    expect(Object.keys(full.state.players)).toHaveLength(4);
    const fifth = joinSession(full, "p5", "Late");
    expect(fifth).toMatchObject({ ok: false, error: "roomFull" });
    expect(fifth.session).toBe(full);
  });

  it("refuses an empty or too long name", () => {
    expect(joinSession(createSession("ABCD"), "p1", "   ")).toMatchObject({ ok: false, error: "invalidName" });
    expect(joinSession(createSession("ABCD"), "p1", "x".repeat(17))).toMatchObject({ ok: false, error: "invalidName" });
    expect(cleanPlayerName("x".repeat(16))).toBe("x".repeat(16));
  });

  it("refuses a new player once the run has started", () => {
    const playing = ok(startSession(lobbyOf(2)));
    expect(joinSession(playing, "p3", "Late")).toMatchObject({ ok: false, error: "gameInProgress" });
  });

  it("gives a returning player their seat back, even during a run", () => {
    const playing = ok(startSession(lobbyOf(2)));
    const dropped = disconnectFromSession(playing, "p2");
    expect(dropped.state.players.p2?.connected).toBe(false);
    const back = ok(joinSession(dropped, "p2", "ignored"));
    expect(back.state.players.p2).toMatchObject({ connected: true, name: "Player 2" });
    expect(Object.keys(back.state.players)).toHaveLength(2);
  });

  it("frees the seat when a player leaves for good", () => {
    const left = leaveSession(lobbyOf(4), "p2");
    expect(Object.keys(left.state.players)).toEqual(["p1", "p3", "p4"]);
    expect(joinSession(left, "p5", "New").ok).toBe(true);
  });
});

describe("starting", () => {
  it("is refused with fewer than two connected players", () => {
    expect(startSession(lobbyOf(1))).toMatchObject({ ok: false, error: "notEnoughPlayers" });
    const oneLeft = disconnectFromSession(lobbyOf(2), "p2");
    expect(startSession(oneLeft).ok).toBe(false);
  });

  it("starts the run with the grace period before the first hazard, for every crew size (#335)", () => {
    expect(ok(startSession(lobbyOf(2))).state.phase).toBe("playing");
    expect(ok(startSession(lobbyOf(2))).director.secondsUntilNext).toBe(FIRST_HAZARD_SECONDS);
    expect(ok(startSession(lobbyOf(4))).director.secondsUntilNext).toBe(FIRST_HAZARD_SECONDS);
  });

  it("is refused while a run is being played", () => {
    const playing = ok(startSession(lobbyOf(2)));
    expect(startSession(playing)).toMatchObject({ ok: false, error: "gameInProgress" });
  });
});

describe("stepping", () => {
  it("does nothing in the lobby", () => {
    const lobby = lobbyOf(2);
    expect(stepFor(lobby, 30)).toBe(lobby);
  });

  it("advances the run clock, waits out the grace period, then uses the crew's interval", () => {
    const quiet = stepFor(ok(startSession(lobbyOf(4))), FIRST_HAZARD_SECONDS - 1);
    expect(quiet.state.time).toBeCloseTo(FIRST_HAZARD_SECONDS - 1, 5);
    expect(Object.keys(quiet.state.hazards)).toHaveLength(0);
    // First hazard at 20 s, then every 9 s for a crew of four: two by 29.5 s.
    const after = stepFor(ok(startSession(lobbyOf(4))), FIRST_HAZARD_SECONDS + 9.5);
    expect(Object.keys(after.state.hazards)).toHaveLength(2);
  });

  it("runs the given systems in order, before the win check", () => {
    const order: string[] = [];
    const first: StepSystem = (state) => {
      order.push("first");
      return state;
    };
    const second: StepSystem = (state) => {
      order.push("second");
      return state;
    };
    stepFor(ok(startSession(lobbyOf(2))), TICK_SECONDS, 1, [first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("ends the run as won when a system brings the train to its destination, then stops", () => {
    const fast = travel(WIN_DISTANCE);
    const won = stepFor(ok(startSession(lobbyOf(2))), 1.5, 1, [fast]);
    expect(won.state.phase).toBe("won");
    expect(won.state.time).toBeCloseTo(1, 5);
    expect(stepFor(won, 10, 1, [fast])).toBe(won);
  });

  it("ends the run as lost when the hull fails", () => {
    const sink: StepSystem = (state) => ({ ...state, journey: { ...state.journey, hull: 0 } });
    expect(stepFor(ok(startSession(lobbyOf(2))), TICK_SECONDS, 1, [sink]).state.phase).toBe("lost");
  });
});

describe("player input", () => {
  const right = { direction: { dx: 1 as const, dy: 0 as const }, interacting: false };
  const holdInteract = { direction: { dx: 0 as const, dy: 0 as const }, interacting: true };

  /** A stand-in for movement: one unit per second in the held direction. */
  const walk: StepSystem = (state, dt, frame) => {
    const players = { ...state.players };
    for (const [id, player] of Object.entries(state.players)) {
      const input = frame.inputs[id];
      if (!input) continue;
      players[id] = { ...player, position: { x: player.position.x + input.direction.dx * dt, y: player.position.y } };
    }
    return { ...state, players };
  };

  it("remembers each player's latest input and hands it to the rule systems", () => {
    let session = ok(startSession(lobbyOf(2)));
    session = ok(applyInput(session, "p1", right));
    expect(session.inputs.p1).toEqual(right);
    expect(session.inputs.p2).toBeUndefined();

    const after = stepFor(session, 2, 1, [walk]);
    expect(after.state.players.p1?.position.x).toBeCloseTo(2, 5);
    expect(after.state.players.p2?.position.x).toBe(0);
    expect(after.inputs.p1).toEqual(right);
  });

  it("replaces the input when the keys change, and keeps the input out of the game state", () => {
    let session = ok(applyInput(ok(startSession(lobbyOf(2))), "p1", right));
    session = ok(applyInput(session, "p1", holdInteract));
    expect(session.inputs.p1).toEqual(holdInteract);
    expect(JSON.stringify(session.state)).not.toContain("interacting");
    expect(inputDirections(session.inputs)).toEqual({ p1: { dx: 0, dy: 0 } });
  });

  it("gives the systems the room's random source", () => {
    const seen: number[] = [];
    const roll: StepSystem = (state, _dt, frame) => {
      seen.push(frame.random.next());
      return state;
    };
    stepFor(ok(startSession(lobbyOf(2))), 3 * TICK_SECONDS, 7, [roll]);
    const expected = createSeededRandom(7);
    expect(seen[0]).toBe(expected.next());
    expect(seen).toHaveLength(3);
  });

  it("refuses input from an unknown or disconnected player, and malformed input", () => {
    const session = ok(startSession(lobbyOf(2)));
    expect(applyInput(session, "nobody", right)).toMatchObject({ ok: false, error: "invalidMessage" });
    expect(applyInput(disconnectFromSession(session, "p2"), "p2", right).ok).toBe(false);
    const bad = { direction: { dx: 5, dy: 0 }, interacting: false } as unknown as typeof right;
    expect(applyInput(session, "p1", bad).ok).toBe(false);
    const missing = { interacting: true } as unknown as typeof right;
    expect(applyInput(session, "p1", missing).ok).toBe(false);
  });

  it("releases a player's keys when they disconnect or leave", () => {
    const session = ok(applyInput(ok(applyInput(ok(startSession(lobbyOf(3))), "p1", right)), "p2", right));
    expect(disconnectFromSession(session, "p1").inputs).toEqual({ p2: right });
    expect(leaveSession(session, "p2").inputs).toEqual({ p1: right });
  });

  it("clears every input when a run starts and when the crew plays again", () => {
    const lobby = ok(applyInput(lobbyOf(2), "p1", right));
    expect(ok(startSession(lobby)).inputs).toEqual({});
    const playing = ok(applyInput(ok(startSession(lobbyOf(2))), "p1", right));
    const won = stepFor(playing, 2, 1, [travel(WIN_DISTANCE)]);
    expect(ok(playAgain(won)).inputs).toEqual({});
  });
});

describe("play again", () => {
  it("returns the crew to the lobby with a fresh director, ready to start again", () => {
    const won = stepFor(ok(startSession(lobbyOf(3))), 30, 1, [travel(WIN_DISTANCE)]);
    const again = ok(playAgain(won));
    expect(again.state.phase).toBe("lobby");
    expect(again.state.hazards).toEqual({});
    expect(Object.keys(again.state.players)).toHaveLength(3);
    expect(again.director.spawnedCount).toBe(0);
    expect(startSession(again).ok).toBe(true);
  });

  it("is refused while a run is still being played", () => {
    expect(playAgain(ok(startSession(lobbyOf(2))))).toMatchObject({ ok: false, error: "invalidMessage" });
  });
});

describe("replay", () => {
  /** A whole scripted run: join, start, play, a player drops and returns, play on. */
  function scriptedRun(seed: number): GameSession {
    const random = createSeededRandom(seed);
    const context = { spots: SPOTS, random, systems: [travel(10)] };
    let session = ok(startSession(lobbyOf(3)));
    for (let tick = 0; tick < 1200; tick++) {
      if (tick === 100) session = ok(applyInput(session, "p1", { direction: { dx: 1, dy: -1 }, interacting: true }));
      if (tick === 300) session = disconnectFromSession(session, "p3");
      if (tick === 500) session = ok(joinSession(session, "p3", "Player 3"));
      session = stepSession(session, TICK_SECONDS, context);
    }
    return session;
  }

  it("gives exactly the same room for the same seed and the same events", () => {
    const first = scriptedRun(2026);
    expect(scriptedRun(2026)).toEqual(first);
    expect(Object.keys(first.state.hazards).length).toBeGreaterThan(0);
  });

  it("gives a different room for a different seed", () => {
    const summary = (seed: number) =>
      Object.values(scriptedRun(seed).state.hazards)
        .map((hazard) => `${hazard.spotId}:${hazard.kind}`)
        .join(",");
    expect(new Set([1, 2, 3, 4, 5, 6].map(summary)).size).toBeGreaterThan(1);
  });
});
