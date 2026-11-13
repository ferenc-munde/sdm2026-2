import { describe, expect, it } from "vitest";
import * as C from "./constants.ts";
import type { ClientMessage, ServerMessage } from "./messages.ts";

describe("constants", () => {
  it("match the game numbers in PLAN.md section 3", () => {
    expect(C.HULL_START).toBe(100);
    expect(C.HULL_MAX).toBe(100);
    expect(C.FUEL_START).toBe(100);
    expect(C.FUEL_MAX).toBe(100);
    expect(C.WIN_DISTANCE).toBe(1800);
    expect(C.TRAIN_FULL_SPEED).toBe(10);
    expect(C.FUEL_DRAIN_PER_SECOND).toBe(1.8);
    expect(C.COAL_FUEL).toBe(35);
    expect(C.LOW_FUEL_THRESHOLD).toBe(25);
    expect([C.SPEED_FACTOR_FULL, C.SPEED_FACTOR_LOW, C.SPEED_FACTOR_STOPPED]).toEqual([1, 0.5, 0]);
    expect(C.HULL_LOSS_PER_BREACH_PER_SECOND).toBe(2.5);
    expect(C.HULL_LOSS_PER_FIRE_PER_SECOND).toBe(1.5);
    expect(C.BREACH_REPAIR_SECONDS).toBe(3);
    expect(C.FIRE_EXTINGUISH_SECONDS).toBe(2.5);
    expect(C.HAZARD_INTERVAL_SECONDS).toBe(12);
    expect(C.HAZARD_INTERVAL_LATE_SECONDS).toBe(7);
    expect(C.HAZARD_LATE_PROGRESS).toBe(0.65);
  });

  it("use the numbers fixed in the issues", () => {
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
    expect(C.HAZARD_INTERVAL_LATE_SECONDS).toBeLessThan(C.HAZARD_INTERVAL_SECONDS);
    expect(C.HAZARD_LATE_PROGRESS).toBeGreaterThan(0);
    expect(C.HAZARD_LATE_PROGRESS).toBeLessThan(1);
  });

  it("define a hazard interval for every allowed player count", () => {
    for (let n = C.MIN_PLAYERS; n <= C.MAX_PLAYERS; n++) {
      expect(C.HAZARD_INTERVAL_BY_PLAYERS[n]).toBeGreaterThan(0);
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
