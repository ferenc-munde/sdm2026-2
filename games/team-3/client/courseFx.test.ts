import { describe, expect, it } from "vitest";
import { COURSE_HULL_DAMAGE } from "../shared/constants.ts";
import { courseImpulseDirection } from "../shared/hazards/course.ts";
import { makeState } from "../shared/run/testState.ts";
import type { GameState, Hazard } from "../shared/types.ts";
import {
  COURSE_FX_SECONDS,
  COURSE_SHAKE_PX,
  COURSE_TILT_RADIANS,
  courseFailed,
  courseFx,
  failureDirection,
} from "./courseFx.ts";

const course = (id = "course-1"): Hazard => ({
  id,
  kind: "course",
  car: 0,
  spotId: "steering-console",
  position: { x: 0, y: 0 },
  age: 0,
  progress: 0,
  countdown: 0,
});

const withCourse = (hull = 100): GameState => makeState({ hazards: { "course-1": course() }, journey: { fuel: 100, hull, distance: 0, speedFactor: 1 } });
const cleared = (hull: number): GameState => makeState({ journey: { fuel: 100, hull, distance: 0, speedFactor: 1 } });

describe("courseFailed", () => {
  it("is true when the course hazard ended and the hull took the hit", () => {
    expect(courseFailed(withCourse(100), cleared(100 - COURSE_HULL_DAMAGE))).toBe(true);
  });

  it("is false when the console was held (hazard gone, no hull loss)", () => {
    expect(courseFailed(withCourse(100), cleared(100))).toBe(false);
  });

  it("ignores other hazards and states without a course event", () => {
    const fire: Hazard = { ...course("fire-1"), kind: "fire" };
    expect(courseFailed(makeState({ hazards: { "fire-1": fire } }), cleared(70))).toBe(false);
    expect(courseFailed(makeState(), cleared(70))).toBe(false);
  });

  it("does not fire twice for the same event", () => {
    const after = cleared(100 - COURSE_HULL_DAMAGE);
    expect(courseFailed(after, after)).toBe(false);
  });
});

describe("failureDirection", () => {
  it("uses the course rule's stable direction", () => {
    const previous = withCourse();
    const next = cleared(88);
    expect(failureDirection(previous, next)).toBe(courseImpulseDirection("course-1"));
    expect([1, -1]).toContain(failureDirection(previous, next));
  });

  it("falls back to +1 when no event ended", () => {
    expect(failureDirection(makeState(), cleared(88))).toBe(1);
  });
});

describe("courseFx", () => {
  it("is zero once the effect is over, or for broken input", () => {
    expect(courseFx(COURSE_FX_SECONDS)).toEqual({ shakeX: 0, shakeY: 0, tilt: 0 });
    expect(courseFx(COURSE_FX_SECONDS + 1)).toEqual({ shakeX: 0, shakeY: 0, tilt: 0 });
    expect(courseFx(Number.NaN)).toEqual({ shakeX: 0, shakeY: 0, tilt: 0 });
    expect(courseFx(-1)).toEqual({ shakeX: 0, shakeY: 0, tilt: 0 });
  });

  it("shakes hardest at the start and settles", () => {
    const early = courseFx(0.02);
    const late = courseFx(COURSE_FX_SECONDS * 0.8);
    expect(Math.abs(early.shakeX) + Math.abs(early.shakeY)).toBeGreaterThan(0);
    expect(Math.abs(late.shakeX)).toBeLessThanOrEqual(Math.abs(COURSE_SHAKE_PX) * 0.2 + 1e-9);
    expect(Math.hypot(early.shakeX, early.shakeY)).toBeLessThanOrEqual(COURSE_SHAKE_PX);
  });

  it("tilts to 2.5 degrees in the push direction and back", () => {
    const peak = courseFx(COURSE_FX_SECONDS / 2, 1);
    expect(peak.tilt).toBeCloseTo(COURSE_TILT_RADIANS, 6);
    expect(courseFx(COURSE_FX_SECONDS / 2, -1).tilt).toBeCloseTo(-COURSE_TILT_RADIANS, 6);
    expect(courseFx(0).tilt).toBeCloseTo(0, 6);
    expect(courseFx(COURSE_FX_SECONDS * 0.999).tilt).toBeLessThan(COURSE_TILT_RADIANS);
  });
});
