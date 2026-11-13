import { describe, expect, it } from "vitest";
import {
  CAR_GAP,
  CAR_LENGTH,
  CAR_WIDTH,
  DOOR_WIDTH,
  WALL_THICKNESS,
  carCentreX,
  createTrainMap,
} from "./trainMap.ts";

describe("createTrainMap", () => {
  it("builds three cars in a row", () => {
    const map = createTrainMap();
    expect(map.cars).toHaveLength(3);
    expect(map.cars.map((car) => car.index)).toEqual([0, 1, 2]);
    expect(map.cars.map((car) => car.x)).toEqual([carCentreX(0), carCentreX(1), carCentreX(2)]);
    for (const car of map.cars) {
      expect(car.width).toBe(CAR_LENGTH);
      expect(car.depth).toBe(CAR_WIDTH);
      expect(car.z).toBe(0);
    }
  });

  it("puts one door in the gap between neighbouring cars", () => {
    const map = createTrainMap();
    expect(map.doors).toHaveLength(2);

    const [firstDoor, secondDoor] = map.doors;
    expect(firstDoor).toMatchObject({ fromCar: 0, toCar: 1, z: 0, depth: DOOR_WIDTH });
    expect(secondDoor).toMatchObject({ fromCar: 1, toCar: 2, z: 0, depth: DOOR_WIDTH });
    expect(firstDoor?.x).toBe(carCentreX(0) + CAR_LENGTH / 2 + CAR_GAP / 2);
    expect(secondDoor?.x).toBe(carCentreX(1) + CAR_LENGTH / 2 + CAR_GAP / 2);
  });

  it("leaves a doorway between two wall pieces on every inner end", () => {
    const map = createTrainMap();
    for (const door of map.doors) {
      const pieces = map.walls.filter((wall) => wall.x === door.x);
      expect(pieces).toHaveLength(2);
      for (const piece of pieces) {
        const nearEdge = Math.abs(piece.z) - piece.depth / 2;
        expect(nearEdge).toBeCloseTo(DOOR_WIDTH / 2);
      }
    }
  });

  it("closes the outer ends of the train", () => {
    const map = createTrainMap();
    const leftEdge = carCentreX(0) - CAR_LENGTH / 2 - WALL_THICKNESS / 2;
    const rightEdge = carCentreX(2) + CAR_LENGTH / 2 + WALL_THICKNESS / 2;
    const left = map.walls.find((wall) => wall.x === leftEdge);
    const right = map.walls.find((wall) => wall.x === rightEdge);
    expect(left?.depth).toBe(CAR_WIDTH + WALL_THICKNESS * 2);
    expect(right?.depth).toBe(CAR_WIDTH + WALL_THICKNESS * 2);
  });

  it("rejects a car count that is not a positive integer", () => {
    expect(() => createTrainMap(0)).toThrow();
    expect(() => createTrainMap(1.5)).toThrow();
  });
});
