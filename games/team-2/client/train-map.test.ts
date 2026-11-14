import { describe, expect, it } from "vitest";
import { TRAIN_CARS, TRAIN_PASSAGES } from "./train-map";

describe("five-carriage map", () => {
  it("connects every adjacent pair with an overlapping central passage", () => {
    expect(TRAIN_CARS).toHaveLength(5);
    expect(TRAIN_PASSAGES).toHaveLength(4);
    for (const passage of TRAIN_PASSAGES) {
      const from = TRAIN_CARS[passage.fromCar]!.bounds;
      const to = TRAIN_CARS[passage.toCar]!.bounds;
      expect(passage.toCar).toBe(passage.fromCar + 1);
      expect(passage.bounds.y).toBeLessThan(from.y + from.height);
      expect(passage.bounds.y + passage.bounds.height).toBeGreaterThan(to.y);
      expect(passage.bounds.x).toBeGreaterThan(from.x);
      expect(passage.bounds.x + passage.bounds.width).toBeLessThan(from.x + from.width);
    }
  });
  it("keeps all uniquely identified stations inside their cars and away from the aisle", () => {
    const ids = new Set<string>();
    for (const car of TRAIN_CARS) for (const station of car.stations) {
      expect(ids.has(station.id)).toBe(false); ids.add(station.id);
      expect(station.x).toBeGreaterThan(car.bounds.x);
      expect(station.x + 58).toBeLessThan(car.bounds.x + car.bounds.width);
      expect(station.y).toBeGreaterThan(car.bounds.y);
      expect(station.y + 30).toBeLessThan(car.bounds.y + car.bounds.height);
      expect(station.x + 58 <= 778 || station.x >= 822).toBe(true);
    }
    expect(ids.size).toBe(20);
  });
});
