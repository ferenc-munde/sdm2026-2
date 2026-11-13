import { expect, it } from "vitest";
import { makeState } from "../shared/run/testState.ts";
import { courseWarningView } from "./courseWarning.ts";
const course = { id: "course-1", kind: "course" as const, car: 0, spotId: "steering-console",
  position: { x: 0, y: 0 }, age: 0, progress: 0, countdown: 5 };

it("shows a five-second warning and highlights the final two seconds", () => {
  expect(courseWarningView(makeState({ hazards: { a: course } }))).toEqual({ seconds: 5, progress: 0, holdNow: false });
  expect(courseWarningView(makeState({ hazards: { a: { ...course, countdown: 1.5, progress: .25 } } })))
    .toEqual({ seconds: 2, progress: .25, holdNow: true });
});
it("follows authoritative progress including a reset on release", () => {
  for (const progress of [0.5, 0]) {
    expect(courseWarningView(makeState({ hazards: { a: { ...course, progress } } }))?.progress).toBe(progress);
  }
});
it("hides on removal, expiry and outside play", () => {
  expect(courseWarningView(makeState())).toBeNull();
  expect(courseWarningView(makeState({ hazards: { a: { ...course, countdown: 0 } } }))).toBeNull();
  for (const phase of ["lobby", "won", "lost"] as const) {
    expect(courseWarningView(makeState({ phase, hazards: { a: course } }))).toBeNull();
  }
});
it("ignores malformed countdowns and clamps progress", () => {
  expect(courseWarningView(makeState({ hazards: { a: { ...course, countdown: NaN } } }))).toBeNull();
  expect(courseWarningView(makeState({ hazards: { a: { ...course, progress: 2 } } }))?.progress).toBe(1);
});
