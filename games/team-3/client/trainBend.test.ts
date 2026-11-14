import { describe, expect, it } from "vitest";
import { CAR_GAP, createTrainMap } from "../shared/map/map.ts";
import { bendPoint, carIndexAt, chain, createBendState, MAX_BEND, restFronts, turn } from "./trainBend.ts";

const map = createTrainMap();
const fronts = restFronts(map);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

describe("the chain of cars", () => {
  it("leaves every point where it is when the train is straight", () => {
    const poses = chain(fronts, [0, 0, 0]);
    for (const car of map.cars) {
      const p = { x: car.x + 50, z: 30 };
      expect(bendPoint(fronts, poses, car.index, p)).toEqual(p);
    }
  });

  it("stays joined at any angles: each car's front sits at the rear coupling of the car before", () => {
    for (const angles of [[0.35, 0.2, 0.05], [-0.3, 0.1, 0.35], [0.35, 0.35, 0.35]]) {
      const poses = chain(fronts, angles);
      for (let i = 1; i < fronts.length; i++) {
        // The point at car i's front, carried along by car i-1, lands on car i's joint.
        const carriedByPrevious = bendPoint(fronts, poses, i - 1, fronts[i]!);
        expect(dist(carriedByPrevious, poses[i]!.joint)).toBeCloseTo(0, 6);
      }
    }
  });

  it("keeps the gap between two cars no wider than it is straight", () => {
    const poses = chain(fronts, [MAX_BEND, 0, 0]);
    const rearOf0 = bendPoint(fronts, poses, 0, { x: map.cars[0]!.x + map.cars[0]!.width / 2, z: 0 });
    const frontOf1 = bendPoint(fronts, poses, 1, { x: map.cars[1]!.x - map.cars[1]!.width / 2, z: 0 });
    expect(dist(rearOf0, frontOf1)).toBeLessThanOrEqual(CAR_GAP + 1e-6);
  });

  it("turns offsets the same way as Three.js rotation.y", () => {
    const p = turn(1, 0, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(-1, 9);
  });

  it("puts the locomotive with car 0 and every floor point in its own car", () => {
    expect(carIndexAt(fronts, fronts[0]!.x - 200)).toBe(0);
    for (const car of map.cars) expect(carIndexAt(fronts, car.x)).toBe(car.index);
  });
});

describe("bending over time", () => {
  it("runs down the train: the front car bends first and the last car follows", () => {
    const bend = createBendState(3);
    let angles = [0, 0, 0];
    for (let t = 0; t < 10; t++) angles = bend.step(0.05, true);
    expect(angles[0]).toBeGreaterThan(angles[1]!);
    expect(angles[1]).toBeGreaterThanOrEqual(angles[2]!);
    for (let t = 0; t < 100; t++) angles = bend.step(0.05, true);
    expect(angles).toEqual([MAX_BEND, MAX_BEND, MAX_BEND]);
  });

  it("straightens again once the curve is over, ending exactly straight", () => {
    const bend = createBendState(3);
    for (let t = 0; t < 100; t++) bend.step(0.05, true);
    let angles = [MAX_BEND, MAX_BEND, MAX_BEND];
    for (let t = 0; t < 100; t++) angles = bend.step(0.05, false);
    expect(angles).toEqual([0, 0, 0]);
    expect(bend.isStraight()).toBe(true);
  });
});
