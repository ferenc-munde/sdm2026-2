import { describe, expect, it } from "vitest";
import { Color } from "three";
import { applyCrewPose, buildCrewFigure, crewPose } from "./crewModel.ts";

describe("crew animation", () => {
  it("swings legs and arms while walking, and barely moves when standing", () => {
    const walking = [0.05, 0.1, 0.15].map((t) => crewPose(t, 160, false));
    expect(Math.max(...walking.map((p) => Math.abs(p.legSwing)))).toBeGreaterThan(0.3);
    const still = crewPose(0.1, 0, false);
    expect(still.legSwing).toBe(0);
    expect(Math.abs(still.bob)).toBeLessThan(0.4);
  });

  it("holds both arms forward while carrying", () => {
    const figure = buildCrewFigure(new Color("#e5484d")).figure;
    applyCrewPose(figure, crewPose(0.3, 160, true), true);
    const left = figure.getObjectByName("armL")!.rotation.z;
    const right = figure.getObjectByName("armR")!.rotation.z;
    expect(left).toBeGreaterThan(1);
    expect(right).toBeCloseTo(left);
  });

  it("has a head, limbs and a cap brim that marks the facing", () => {
    const { figure } = buildCrewFigure(new Color("#3e63dd"));
    for (const name of ["head", "legL", "legR", "armL", "armR", "facing", "shadow"]) {
      expect(figure.getObjectByName(name), name).toBeDefined();
    }
  });
});
