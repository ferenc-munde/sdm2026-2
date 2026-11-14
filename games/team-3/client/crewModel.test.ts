import { describe, expect, it } from "vitest";
import { Color } from "three";
import { applyCrewPose, buildCrewFigure } from "./crewModel.ts";
import { CARRY_ARM_LIFT, crewPose } from "./crewPose.ts";

describe("crew figure", () => {
  it("holds both arms forward while carrying", () => {
    const figure = buildCrewFigure(new Color("#e5484d")).figure;
    applyCrewPose(figure, crewPose({ speed: 160, phase: 1, seconds: 0, carrying: true, interacting: false }));
    const left = figure.getObjectByName("armL")!.rotation.z;
    const right = figure.getObjectByName("armR")!.rotation.z;
    expect(left).toBeCloseTo(CARRY_ARM_LIFT);
    expect(right).toBeCloseTo(left);
  });

  it("swings the legs opposite each other while walking", () => {
    const figure = buildCrewFigure(new Color("#e5484d")).figure;
    applyCrewPose(figure, crewPose({ speed: 160, phase: 1, seconds: 0, carrying: false, interacting: false }));
    const left = figure.getObjectByName("legL")!.rotation.z;
    expect(Math.abs(left)).toBeGreaterThan(0.3);
    expect(figure.getObjectByName("legR")!.rotation.z).toBeCloseTo(-left);
  });

  it("has a head, limbs and a cap brim that marks the facing", () => {
    const { figure } = buildCrewFigure(new Color("#3e63dd"));
    for (const name of ["head", "legL", "legR", "armL", "armR", "facing", "shadow"]) {
      expect(figure.getObjectByName(name), name).toBeDefined();
    }
  });
});
