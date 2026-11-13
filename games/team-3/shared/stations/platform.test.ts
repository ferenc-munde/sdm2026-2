import { describe, expect, it, vi } from "vitest";
import { makeState } from "../run/testState.ts";
import { createPlatformPractice, isNearPlatformBoard, platformPracticeView, stepPlatformPractice,
  useDepartureLever, usePracticeObject, type PlatformObjectLayout } from "./platform.ts";

const layout: PlatformObjectLayout = {
  departureLever: { x: 0, y: 0 }, coalPile: { x: 100, y: 0 }, boiler: { x: 200, y: 0 },
  wrench: { x: 300, y: 0 }, breach: { x: 400, y: 0 }, boards: [{ x: 500, y: 0 }],
};
const lobby = () => makeState({ phase: "lobby" });

describe("departure lever", () => {
  it("rejects non-hosts without calling the start rule", () => {
    const session = { state: lobby(), crewSize: 2 };
    const rules = { canDepart: vi.fn(() => true), start: vi.fn(() => ({ ok: true as const, session })) };
    expect(useDepartureLever(session, session.state, "p1", "p2", layout, rules)).toMatchObject({ ok: false, message: "Only the host can depart" });
    expect(rules.start).not.toHaveBeenCalled();
    expect(rules.canDepart).not.toHaveBeenCalled();
  });
  it("waits when the authoritative crew-complete rule rejects departure", () => {
    const session = { state: lobby(), crewSize: 3 };
    const rules = { canDepart: () => false, start: vi.fn(() => ({ ok: true as const, session })) };
    expect(useDepartureLever(session, session.state, "p1", "p1", layout, rules)).toMatchObject({ ok: false, message: "Waiting for the crew" });
    expect(rules.start).not.toHaveBeenCalled();
  });
  it("calls the start rule once for the nearby host with a complete crew", () => {
    const session = { state: lobby() };
    const departed = { state: { ...session.state, phase: "playing" as const } };
    const rules = { canDepart: vi.fn(() => true), start: vi.fn(() => ({ ok: true as const, session: departed })) };
    expect(useDepartureLever(session, session.state, "p1", "p1", layout, rules)).toEqual({ ok: true, session: departed });
    expect(rules.start).toHaveBeenCalledExactlyOnceWith(session, "p1");
  });
  it("rejects remote, disconnected and post-lobby use", () => {
    for (const state of [makeState(), lobby(), lobby()]) {
      if (state.phase === "lobby") state.players.p1!.position = { x: 1000, y: 0 };
      const rules = { canDepart: () => true, start: vi.fn(() => ({ ok: true as const, session: state })) };
      expect(useDepartureLever(state, state, "p1", "p1", layout, rules).ok).toBe(false);
      expect(rules.start).not.toHaveBeenCalled();
    }
    const state = lobby();
    state.players.p1!.connected = false;
    expect(useDepartureLever(state, state, "p1", "p1", layout, { canDepart: () => true, start: () => ({ ok: true, session: state }) }).ok).toBe(false);
  });
});

describe("isolated platform practice", () => {
  it("takes and feeds coal without touching real journey, items, or player inventory", () => {
    const state = lobby();
    state.players.p1!.position = { ...layout.coalPile };
    const original = structuredClone(state);
    let practice = usePracticeObject(state, createPlatformPractice(layout), "p1", layout);
    expect(platformPracticeView(state, practice, layout).players.p1!.heldItem).not.toBeNull();
    expect(state).toEqual(original);
    state.players.p1!.position = { ...layout.boiler };
    const beforeFeed = structuredClone(state);
    practice = usePracticeObject(state, practice, "p1", layout);
    expect(practice.boilerFuel).toBe(35);
    expect(platformPracticeView(state, practice, layout).players.p1!.heldItem).toBeNull();
    expect(state).toEqual(beforeFeed);
    expect(state.journey.fuel).toBe(original.journey.fuel);
  });
  it("repairs with the practice wrench and respawns exactly five seconds later", () => {
    const state = lobby();
    state.players.p1!.position = { ...layout.wrench };
    let practice = usePracticeObject(state, createPlatformPractice(layout), "p1", layout);
    expect(practice.items["practice-wrench"]!.heldBy).toBe("p1");
    state.players.p1!.position = { ...layout.breach };
    const original = structuredClone(state);
    practice = stepPlatformPractice(state, practice, { p1: true }, 3, layout);
    expect(practice.breach).toBeNull();
    expect(practice.respawnIn).toBe(5);
    practice = stepPlatformPractice(state, practice, {}, 4.99, layout);
    expect(practice.breach).toBeNull();
    practice = stepPlatformPractice(state, practice, {}, 0.01, layout);
    expect(practice.breach?.progress).toBe(0);
    expect(practice.items["practice-wrench"]!.heldBy).toBe("p1");
    expect(state).toEqual(original);
  });
  it("requires the wrench and resets interrupted repair", () => {
    const state = lobby();
    state.players.p1!.position = { ...layout.breach };
    let practice = createPlatformPractice(layout);
    practice = stepPlatformPractice(state, practice, { p1: true }, 3, layout);
    expect(practice.breach?.progress).toBe(0);
    state.players.p1!.position = { ...layout.wrench };
    practice = usePracticeObject(state, practice, "p1", layout);
    state.players.p1!.position = { ...layout.breach };
    practice = stepPlatformPractice(state, practice, { p1: true }, 1.5, layout);
    expect(practice.breach?.progress).toBeCloseTo(0.5);
    practice = stepPlatformPractice(state, practice, {}, 0.05, layout);
    expect(practice.breach?.progress).toBe(0);
  });
  it("returns the wrench to its rack if its holder disconnects", () => {
    const state = lobby();
    state.players.p1!.position = { ...layout.wrench };
    let practice = usePracticeObject(state, createPlatformPractice(layout), "p1", layout);
    state.players.p1!.connected = false;
    practice = stepPlatformPractice(state, practice, {}, 0.05, layout);
    expect(practice.items["practice-wrench"]).toMatchObject({ heldBy: null, position: layout.wrench });
  });
  it("does nothing after departure or for invalid elapsed time", () => {
    const practice = createPlatformPractice(layout);
    expect(usePracticeObject(makeState(), practice, "p1", layout)).toBe(practice);
    expect(stepPlatformPractice(makeState(), practice, {}, 3, layout)).toBe(practice);
    expect(stepPlatformPractice(lobby(), practice, {}, Number.NaN, layout)).toBe(practice);
  });
  it("shows the board only to a connected nearby player in the lobby", () => {
    const state = lobby();
    expect(isNearPlatformBoard(state, "p1", layout)).toBe(false);
    state.players.p1!.position = { ...layout.boards[0]! };
    expect(isNearPlatformBoard(state, "p1", layout)).toBe(true);
    expect(isNearPlatformBoard({ ...state, phase: "playing" }, "p1", layout)).toBe(false);
    state.players.p1!.connected = false;
    expect(isNearPlatformBoard(state, "p1", layout)).toBe(false);
  });
});
