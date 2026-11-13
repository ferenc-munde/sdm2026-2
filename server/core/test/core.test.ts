import { describe, expect, it } from "vitest";
import { InputEnvelopeSchema, SeededRandom, isDebugEnabled, parseAppEnv } from "../src/shared";
import { BaseState, RoomSettingsSchema, Seat } from "../src/sim";

describe("SeededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("restores a saved state", () => {
    const a = new SeededRandom(7);
    a.next();
    const saved = a.getState();
    const expected = a.next();
    a.setState(saved);
    expect(a.next()).toBe(expected);
  });

  it("keeps int() inside the range", () => {
    const r = new SeededRandom(1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe("env", () => {
  it("falls back to local and disables debug only in production", () => {
    expect(parseAppEnv("nonsense")).toBe("local");
    expect(isDebugEnabled("development")).toBe(true);
    expect(isDebugEnabled("production")).toBe(false);
  });
});

describe("messages", () => {
  it("rejects an input envelope without a valid seq", () => {
    expect(InputEnvelopeSchema.safeParse({ seq: -1, input: {} }).success).toBe(false);
    expect(InputEnvelopeSchema.safeParse({ seq: 0, input: { x: 1 } }).success).toBe(true);
  });
});

describe("sim", () => {
  it("applies room setting defaults", () => {
    expect(RoomSettingsSchema.parse({})).toEqual({
      tickRate: 20,
      patchRate: 20,
      maxPlayers: 4,
      reconnectSeconds: 20,
    });
  });

  it("creates a state with seats", () => {
    const state = new BaseState();
    const seat = new Seat();
    seat.playerId = "p1";
    state.seats.set("p1", seat);
    expect(state.seats.get("p1")?.connected).toBe(true);
  });
});
