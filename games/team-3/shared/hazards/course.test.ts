import { describe, expect, it } from "vitest";
import { startCourse, stepCourses } from "./course.ts";
import { makeState } from "../run/testState.ts";
import type { Station } from "../types.ts";
const spot = { id: "course-spot", car: 0, position: { x: 0, y: 0 } };
const console: Station = { kind: "steeringConsole", car: 0, position: { x: 0, y: 0 } };
const start = () => startCourse(makeState(), spot);
describe("course warning", () => {
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
