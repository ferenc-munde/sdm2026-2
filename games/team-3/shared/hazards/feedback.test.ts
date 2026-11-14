import { describe, expect, it } from "vitest";
import { makeState } from "../run/testState.ts";
import type { Hazard } from "../types.ts";
import { fixedHazardsBetween } from "./feedback.ts";

const hazard = (kind: Hazard["kind"]): Hazard => ({
  id: `${kind}-1`, kind, car: 0, spotId: "engine", position: { x: 0, y: 0 }, age: 2,
  progress: 0.9, countdown: kind === "course" ? 1 : null,
});
const withHazard = (kind: Hazard["kind"]) => {
  const value = hazard(kind);
  return makeState({ phase: "playing", hazards: { [value.id]: value } });
};

describe("fixedHazardsBetween", () => {
  it.each(["breach", "fire"] as const)("reports a cleared %s", (kind) => {
    expect(fixedHazardsBetween(withHazard(kind), makeState({ phase: "playing" }))).toEqual([{ id: `${kind}-1`, kind }]);
  });

  it("reports a safely cleared course warning", () => {
    expect(fixedHazardsBetween(withHazard("course"), makeState({ phase: "playing" }))).toEqual([{ id: "course-1", kind: "course" }]);
  });

  it("does not call a failed course warning fixed", () => {
    const next = makeState({ phase: "playing", journey: { fuel: 100, hull: 88, distance: 0, speedFactor: 1 } });
    expect(fixedHazardsBetween(withHazard("course"), next)).toEqual([]);
  });

  it("ignores cleanup when a run ends", () => {
    expect(fixedHazardsBetween(withHazard("fire"), makeState({ phase: "lost" }))).toEqual([]);
  });
});
