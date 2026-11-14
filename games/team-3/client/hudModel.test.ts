import { describe, expect, it } from "vitest";
import { FUEL_MAX, HULL_MAX, LOW_FUEL_THRESHOLD, WIN_DISTANCE } from "../shared/constants.ts";
import type { Journey } from "../shared/types.ts";
import {
  BAR_COLORS,
  FUEL_YELLOW_AT,
  HULL_CRITICAL_AT,
  HULL_DANGER_AT,
  barFraction,
  fuelColor,
  fuelIsLow,
  hullDrainPerSecond,
  hullFraction,
  hudView,
  journeyFraction,
  shouldWarnHull,
} from "./hudModel.ts";

const journey = (overrides: Partial<Journey> = {}): Journey => ({
  fuel: FUEL_MAX,
  hull: HULL_MAX,
  distance: 0,
  speedFactor: 1,
  ...overrides,
});

describe("bar fractions", () => {
  it("maps a value to its share of the bar", () => {
    expect(barFraction(50, 100)).toBe(0.5);
    expect(barFraction(0, 100)).toBe(0);
    expect(barFraction(100, 100)).toBe(1);
    expect(hullFraction(journey({ hull: 25 }))).toBe(0.25);
    expect(journeyFraction(journey({ distance: WIN_DISTANCE / 2 }))).toBe(0.5);
  });

  it("clamps values outside the range", () => {
    expect(barFraction(-10, 100)).toBe(0);
    expect(barFraction(250, 100)).toBe(1);
    expect(hullFraction(journey({ hull: -3 }))).toBe(0);
    expect(journeyFraction(journey({ distance: WIN_DISTANCE * 3 }))).toBe(1);
  });

  it("survives broken numbers instead of drawing a NaN bar", () => {
    expect(barFraction(Number.NaN, 100)).toBe(0);
    expect(barFraction(50, 0)).toBe(0);
    expect(barFraction(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("fuel colour", () => {
  it("turns red at or below the low-fuel threshold", () => {
    expect(fuelIsLow(journey({ fuel: LOW_FUEL_THRESHOLD + 1 }))).toBe(false);
    expect(fuelIsLow(journey({ fuel: LOW_FUEL_THRESHOLD }))).toBe(true);
    expect(fuelIsLow(journey({ fuel: LOW_FUEL_THRESHOLD - 1 }))).toBe(true);
    expect(fuelIsLow(journey({ fuel: 0 }))).toBe(true);
  });

  it("goes green, then yellow, then red (#217)", () => {
    expect(fuelColor(100)).toBe(BAR_COLORS.fuel);
    expect(fuelColor(FUEL_YELLOW_AT + 1)).toBe(BAR_COLORS.fuel);
    expect(fuelColor(FUEL_YELLOW_AT)).toBe(BAR_COLORS.fuelMid);
    expect(fuelColor(LOW_FUEL_THRESHOLD + 1)).toBe(BAR_COLORS.fuelMid);
    expect(fuelColor(LOW_FUEL_THRESHOLD)).toBe(BAR_COLORS.fuelLow);
    expect(fuelColor(0)).toBe(BAR_COLORS.fuelLow);
    expect(fuelColor(Number.NaN)).toBe(BAR_COLORS.fuelLow);
  });
});

describe("hudView", () => {
  it("carries every value the bars show", () => {
    const view = hudView(journey({ hull: 80, fuel: 60, distance: 900 }));
    expect(view).toMatchObject({
      hull: 80,
      fuel: 60,
      distance: 900,
      hullWidth: 0.8,
      fuelWidth: 0.6,
      distanceWidth: 0.5,
      fuelColor: BAR_COLORS.fuel,
      distanceText: `900 / ${WIN_DISTANCE}`,
      lowFuel: false,
    });
  });

  it("uses the low-fuel colour with the same values", () => {
    const view = hudView(journey({ hull: 100, fuel: LOW_FUEL_THRESHOLD, distance: 10 }));
    expect(view.fuelColor).toBe(BAR_COLORS.fuelLow);
    expect(view.lowFuel).toBe(true);
    expect(view.fuelWidth).toBeCloseTo(LOW_FUEL_THRESHOLD / FUEL_MAX);
  });

  it("rounds the numbers it shows", () => {
    const view = hudView(journey({ hull: 79.6, fuel: 24.4, distance: 123.7 }));
    expect([view.hull, view.fuel, view.distance]).toEqual([80, 24, 124]);
    expect(view.distanceText).toBe(`124 / ${WIN_DISTANCE}`);
  });
});

describe("hull information (#421)", () => {
  it("adds up what is draining the hull", () => {
    expect(hullDrainPerSecond([])).toBe(0);
    expect(hullDrainPerSecond([{ kind: "breach" }])).toBe(2.5);
    expect(hullDrainPerSecond([{ kind: "fire" }])).toBe(1.5);
    expect(hullDrainPerSecond([{ kind: "breach" }, { kind: "fire" }, { kind: "course" }])).toBe(4);
  });

  it("exposes the drain and the critical threshold", () => {
    expect(hudView(journey({ hull: 80 })).hullDrain).toBe(0);
    expect(hudView(journey({ hull: 80 }), [{ kind: "breach" }]).hullDrain).toBe(2.5);
    expect(hudView(journey({ hull: HULL_CRITICAL_AT })).hullCritical).toBe(false);
    expect(hudView(journey({ hull: HULL_CRITICAL_AT - 1 })).hullCritical).toBe(true);
    expect(hudView(journey({ hull: HULL_DANGER_AT })).hullCritical).toBe(true);
    expect(HULL_DANGER_AT).toBe(15);
  });

  it("warns the first time the hull drops below 15", () => {
    expect(shouldWarnHull(HULL_DANGER_AT, false)).toBe(false);
    expect(shouldWarnHull(HULL_DANGER_AT - 1, false)).toBe(true);
    expect(shouldWarnHull(5, true)).toBe(false);
    expect(shouldWarnHull(Number.NaN, false)).toBe(false);
  });
});
