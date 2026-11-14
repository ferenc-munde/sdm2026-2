import { describe, expect, it } from "vitest";
import { createTrainMap } from "../shared/map/map.ts";
import type { Vec2 } from "../shared/types.ts";
import { BENCH_DEPTH, FAR_INNER, FURNISHING_CLEARANCE, furnishingLayout } from "./trainFurnish.ts";

const map = createTrainMap();
const spots = [...map.stations.map((s) => s.position), ...map.hazardSpots.map((s) => s.position)];
const car = map.cars[1]!;
const farY = car.y + FAR_INNER + BENCH_DEPTH;

describe("passenger furnishing (#437)", () => {
  it("furnishes a car with benches and cases when nothing blocks it", () => {
    const layout = furnishingLayout(car, []);
    expect(layout.filter((s) => s.kind === "bench")).toHaveLength(4);
    expect(layout.filter((s) => s.kind === "suitcase")).toHaveLength(2);
    for (const spot of layout) {
      expect(spot.dz).toBe(farY - car.y);
      // Everything sits fully between the car's two ends (its length, not its depth).
      const half = spot.kind === "bench" ? 32 : 9;
      expect(spot.dx - half, `${spot.kind} ${spot.dx}`).toBeGreaterThan(-car.width / 2);
      expect(spot.dx + half, `${spot.kind} ${spot.dx}`).toBeLessThan(car.width / 2);
    }
  });

  it("keeps every decoration clear of a station or hazard spot", () => {
    for (const trainCar of map.cars) {
      for (const spot of furnishingLayout(trainCar, spots)) {
        const at = { x: trainCar.x + spot.dx, y: trainCar.y + spot.dz };
        const needed = FURNISHING_CLEARANCE;
        for (const target of spots) {
          const distance = Math.hypot(target.x - at.x, target.y - at.y);
          expect(distance, `${spot.kind} near (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`).toBeGreaterThanOrEqual(needed);
        }
      }
    }
  });

  it("drops a bench that would sit on an interaction point", () => {
    const blocked: Vec2[] = [{ x: car.x - car.width / 2 + 40 + 17 + 33.5, y: farY }];
    expect(furnishingLayout(car, blocked).length).toBeLessThan(furnishingLayout(car, []).length);
  });
});
