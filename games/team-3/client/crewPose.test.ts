import { describe, expect, it } from "vitest";
import {
  advanceWalk,
  CARRY_ARM_LIFT,
  crewPose,
  easeAngle,
  headingFor,
  IDLE_BOB,
  INTERACT_ARM_LIFT,
  MAX_LEG_SWING,
  smoothSpeed,
  speedBetween,
  walkAmount,
  WALK_FULL_SPEED,
  wheelAngle,
} from "./crewPose.ts";

describe("walk cycle", () => {
  it("is still at rest and full at the walking speed", () => {
    expect(walkAmount(0)).toBe(0);
    expect(walkAmount(-10)).toBe(0);
    expect(walkAmount(Number.NaN)).toBe(0);
    expect(walkAmount(WALK_FULL_SPEED / 2)).toBeCloseTo(0.5);
    expect(walkAmount(WALK_FULL_SPEED)).toBe(1);
    expect(walkAmount(WALK_FULL_SPEED * 3)).toBe(1);
  });

  it("advances with the distance walked, not the frame rate", () => {
    expect(advanceWalk(0, 0, 0.1)).toBe(0);
    expect(advanceWalk(1, 100, 0)).toBe(1);
    const one = advanceWalk(0, 80, 0.1) + advanceWalk(0, 80, 0.1);
    expect(advanceWalk(0, 80, 0.2)).toBeCloseTo(one);
  });

  it("swings the legs and the opposite arms while moving", () => {
    const pose = crewPose({ speed: WALK_FULL_SPEED, phase: Math.PI / 2, seconds: 1, carrying: false, interacting: false });
    expect(pose.legSwing).toBeCloseTo(MAX_LEG_SWING);
    expect(pose.armSwing).toBeLessThan(0); // the left arm goes back as the left leg goes forward
    expect(Math.abs(pose.armSwing)).toBeLessThan(Math.abs(pose.legSwing));
    expect(pose.bob).toBeGreaterThan(0);

    const still = crewPose({ speed: 0, phase: Math.PI / 2, seconds: 1, carrying: false, interacting: false });
    expect(still.legSwing).toBe(0);
    expect(still.armSwing).toBe(0);
  });

  it("breathes while standing still", () => {
    const a = crewPose({ speed: 0, phase: 0, seconds: 0, carrying: false, interacting: false });
    const b = crewPose({ speed: 0, phase: 0, seconds: 1, carrying: false, interacting: false });
    expect(a.bob).toBeGreaterThanOrEqual(0);
    expect(Math.max(a.bob, b.bob)).toBeLessThanOrEqual(IDLE_BOB);
    expect(a.bob).not.toBe(b.bob);
  });

  it("lifts both arms for a carried item, and further while interacting", () => {
    const carry = crewPose({ speed: WALK_FULL_SPEED, phase: 1, seconds: 0, carrying: true, interacting: false });
    expect(carry.armLift).toBe(CARRY_ARM_LIFT);
    expect(carry.armSwing).toBe(0);

    const interact = crewPose({ speed: 0, phase: 1, seconds: 0, carrying: true, interacting: true });
    expect(interact.armLift).toBe(INTERACT_ARM_LIFT);
    expect(interact.armLift).toBeGreaterThan(CARRY_ARM_LIFT);
  });
});

describe("measured speed", () => {
  it("measures world units per second between two drawn positions", () => {
    expect(speedBetween({ x: 0, y: 0 }, { x: 30, y: 40 }, 0.5)).toBeCloseTo(100);
    expect(speedBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBe(0);
    expect(speedBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, Number.NaN)).toBe(0);
  });

  it("eases toward the measurement and caps an impossible jump", () => {
    const once = smoothSpeed(0, 100, 0.1);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(100);
    expect(smoothSpeed(once, 100, 0.1)).toBeGreaterThan(once);
    expect(smoothSpeed(0, 10_000, 0.1)).toBeLessThanOrEqual(WALK_FULL_SPEED * 2);
    expect(smoothSpeed(42, 100, 0)).toBe(42);
  });
});

describe("wheels", () => {
  it("roll with the train speed factor and stop with it", () => {
    expect(wheelAngle(1, 0, 0.1)).toBe(1);
    expect(wheelAngle(1, 0.5, 0.1)).toBeGreaterThan(1);
    expect(wheelAngle(1, 1, 0.1)).toBeGreaterThan(wheelAngle(1, 0.5, 0.1));
    expect(wheelAngle(1, 1, 0)).toBe(1);
    expect(wheelAngle(1, Number.NaN, 0.1)).toBe(1);
  });
});

describe("heading and smooth turning (#355)", () => {
  it("rests at +x, and turns the same way placePlayer did", () => {
    expect(headingFor()).toBe(0);
    expect(headingFor({ dx: 0, dy: 0 })).toBe(0);
    expect(headingFor({ dx: 1, dy: 0 })).toBe(0);
    expect(headingFor({ dx: 0, dy: 1 })).toBeCloseTo(-Math.PI / 2);
    expect(headingFor({ dx: 0, dy: -1 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(headingFor({ dx: -1, dy: 0 }))).toBeCloseTo(Math.PI);
  });

  it("eases toward the target without overshooting", () => {
    let angle = 0;
    const target = Math.PI / 2;
    for (let frame = 0; frame < 120; frame += 1) {
      const next = easeAngle(angle, target, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(angle);
      expect(next).toBeLessThanOrEqual(target + 1e-9);
      angle = next;
    }
    expect(angle).toBeCloseTo(target, 6);
    expect(easeAngle(1, 2, 0)).toBe(1);
  });

  it("takes the short way across the -pi/pi wrap", () => {
    // 3.0 -> -3.0 is +0.283 radians across the wrap, not -6 radians the long way.
    const step = easeAngle(3, -3, 0.1);
    expect(step).toBeGreaterThan(3);
    expect(step).toBeLessThan(3.3);

    let angle = 3;
    for (let frame = 0; frame < 60; frame += 1) angle = easeAngle(angle, -3, 1 / 60);
    expect(Math.cos(angle - -3)).toBeGreaterThan(0.999999);
  });

  it("handles exactly opposite headings without NaN", () => {
    const step = easeAngle(0, Math.PI, 0.1);
    expect(Number.isFinite(step)).toBe(true);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(Math.PI);
  });
});
