import { describe, expect, it } from "vitest";
import * as C from "./constants.ts";
import type { ClientMessage, ServerMessage } from "./messages.ts";

describe("constants", () => {
  it("use the numbers fixed in the issues", () => {
    expect(C.FUEL_DRAIN_PER_SECOND).toBe(1.8); // #13
    expect(C.COAL_FUEL).toBe(35); // #15
    expect(C.FUEL_MAX).toBe(100); // #15
    expect(C.HULL_LOSS_PER_BREACH_PER_SECOND).toBe(2.5); // #13
    expect(C.HULL_LOSS_PER_FIRE_PER_SECOND).toBe(1.5); // #13
    expect(C.WIN_DISTANCE).toBe(1800); // #13
    expect(C.TICK_RATE).toBe(20); // #9
    expect(C.COURSE_WARNING_SECONDS).toBe(5); // #28
    expect(C.COURSE_HOLD_WINDOW_SECONDS).toBe(2); // #28
    expect(C.COURSE_HULL_DAMAGE).toBe(12); // #28
    expect(C.FIRE_SPREAD_SECONDS).toBe(15); // #30
  });

  it("are internally consistent", () => {
    expect(C.FUEL_START).toBeLessThanOrEqual(C.FUEL_MAX);
    expect(C.HULL_START).toBeLessThanOrEqual(C.HULL_MAX);
    expect(C.LOW_FUEL_THRESHOLD).toBeGreaterThan(0);
    expect(C.LOW_FUEL_THRESHOLD).toBeLessThan(C.FUEL_MAX);
    expect(C.COURSE_HOLD_WINDOW_SECONDS).toBeLessThan(C.COURSE_WARNING_SECONDS);
    expect(C.TICK_SECONDS).toBeCloseTo(1 / C.TICK_RATE);
  });

  it("define a hazard interval for every allowed player count", () => {
    for (let n = C.MIN_PLAYERS; n <= C.MAX_PLAYERS; n++) {
      expect(C.HAZARD_INTERVAL_SECONDS[n]).toBeGreaterThan(0);
    }
  });
});

describe("messages", () => {
  it("round-trip through JSON unchanged", () => {
    const sent: (ClientMessage | ServerMessage)[] = [
      { type: "joinRoom", name: "Ada", code: "ABCD" },
      { type: "input", direction: { dx: 1, dy: -1 }, interacting: false },
      { type: "error", code: "roomFull", message: "Room is full" },
    ];
    for (const msg of sent) {
      expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
    }
  });
});
