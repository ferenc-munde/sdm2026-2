import { describe, expect, it } from "vitest";
import { applyCourseFailure, courseImpulseDirection, startCourse, stepCourses } from "./course.ts";
import { makeState } from "../run/testState.ts";
import type { Station } from "../types.ts";
const spot = { id: "course-spot", car: 0, position: { x: 0, y: 0 } };
const console: Station = { kind: "steeringConsole", car: 0, position: { x: 0, y: 0 } };
const start = () => startCourse(makeState(), spot);
describe("course warning", () => {
  it("pushes every player and loose item sideways on failure", () => {
    const state = start();
    state.items.loose = { id: "loose", kind: "coal", position: { x: 0, y: 0 }, heldBy: null, velocity: { x: 0, y: 0 } };
    state.items.held = { id: "held", kind: "wrench", position: { x: 0, y: 0 }, heldBy: "p1", velocity: { x: 0, y: 0 } };
    state.players.p1!.heldItem = "held";
    const next = stepCourses(state, {}, 5, console);
    expect(Math.abs(next.players.p1!.velocity!.y)).toBe(450);
    expect(next.players.p1!.velocity!.x).toBe(0);
    expect(next.items.loose!.velocity).toEqual(next.players.p1!.velocity);
    expect(next.items.held!.velocity).toEqual({ x: 0, y: 0 });
  });

  it("chooses a deterministic impulse direction", () => {
    expect(courseImpulseDirection("course-1")).toBe(courseImpulseDirection("course-1"));
    const state = makeState();
    expect(applyCourseFailure(state, "course-1")).not.toBe(state);
  });

  it("cannot steer with a fire beside the console", () => {
    const state = start();
    state.hazards.fire = {
      id: "fire", kind: "fire", car: console.car, spotId: "console-fire",
      position: { ...console.position }, age: 0, progress: 0, countdown: null,
    };
    expect(stepCourses(state, { p1: true }, 5, console).journey.hull).toBe(88);
  });

  it("starts with a five-second countdown", () => {
    expect(Object.values(start().hazards)[0]?.countdown).toBe(5);
  });
  it("avoids damage when held for the final two seconds", () => {
    let s = stepCourses(start(), {}, 3, console);
    for (let i = 0; i < 40; i++) s = stepCourses(s, { p1: true }, 0.05, console);
    expect(s.hazards).toEqual({}); expect(s.journey.hull).toBe(100);
  });
  it("takes exactly twelve hull once without steering", () => {
    const s = stepCourses(start(), {}, 5, console);
    expect(s.journey.hull).toBe(88);
    expect(stepCourses(s, {}, 5, console).journey.hull).toBe(88);
  });
  it("early holding and late release do not count as a full final hold", () => {
    const s = stepCourses(start(), { p1: true }, 4, console);
    expect(stepCourses(s, {}, 1, console).journey.hull).toBe(88);
  });
  it("rejects distant/disconnected steering and clamps hull", () => {
    const s = start(); s.players.p1!.position.x = 41; s.players.p2!.connected = false; s.journey.hull = 4;
    expect(stepCourses(s, { p1: true, p2: true }, 5, console).journey.hull).toBe(0);
  });
  it("does not mutate input or trigger duplicate course events", () => {
    const s = start(); expect(startCourse(s, { ...spot, id: "other" })).toBe(s);
    stepCourses(s, {}, 2, console); expect(Object.values(s.hazards)[0]?.countdown).toBe(5);
  });
});
