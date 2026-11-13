// The train layout used by the client.
//
// The rules own the real map in `shared/map/` (#6). Until that lands, the client
// keeps a small, deterministic layout here so the renderer can be built and
// tested on its own. When #6 is merged, replace `TrainMap` with the shared type
// and pass the shared map into `buildTrainScene`; nothing else has to change.

/** An axis-aligned rectangle on the train floor. x runs along the train, z across it. */
export interface FloorBox {
  /** Centre on the x axis, in world units. */
  x: number;
  /** Centre on the z axis, in world units. */
  z: number;
  /** Size along the x axis, in world units. */
  width: number;
  /** Size along the z axis, in world units. */
  depth: number;
}

/** One car of the train. */
export interface CarLayout extends FloorBox {
  /** 0 is the engine car at the front, `carCount - 1` is the last car. */
  index: number;
}

/** A solid wall. The client draws it as a box standing on the floor. */
export interface WallLayout extends FloorBox {}

/** A doorway between two cars. Drawn flat on the floor so the gap is visible. */
export interface DoorLayout extends FloorBox {
  /** Index of the car on the front side of the door. */
  fromCar: number;
  /** Index of the car on the back side of the door. */
  toCar: number;
}

/** Everything the renderer needs to draw the train. */
export interface TrainMap {
  cars: CarLayout[];
  walls: WallLayout[];
  doors: DoorLayout[];
}

/** Length of one car along the train, in world units. */
export const CAR_LENGTH = 420;
/** Width of one car across the train, in world units. */
export const CAR_WIDTH = 220;
/** Free space between two cars, covered by a door. */
export const CAR_GAP = 24;
/** Thickness of every wall, in world units. */
export const WALL_THICKNESS = 10;
/** Width of the opening between two cars. */
export const DOOR_WIDTH = 100;
/** Height of the walls, in world units. */
export const WALL_HEIGHT = 30;

/** Centre of `car` on the x axis. */
export function carCentreX(index: number): number {
  return index * (CAR_LENGTH + CAR_GAP);
}

/**
 * Builds the default three-car train: a floor per car, side walls, and end walls
 * with a doorway between neighbouring cars. Deterministic, so it can be tested.
 */
export function createTrainMap(carCount = 3): TrainMap {
  if (!Number.isInteger(carCount) || carCount < 1) {
    throw new Error("carCount must be a positive integer");
  }

  const cars: CarLayout[] = [];
  const walls: WallLayout[] = [];
  const doors: DoorLayout[] = [];

  const wallAt = (x: number, z: number, width: number, depth: number): void => {
    walls.push({ x, z, width, depth });
  };

  for (let index = 0; index < carCount; index += 1) {
    const x = carCentreX(index);
    cars.push({ index, x, z: 0, width: CAR_LENGTH, depth: CAR_WIDTH });

    // The two long side walls have no openings.
    wallAt(x, CAR_WIDTH / 2 + WALL_THICKNESS / 2, CAR_LENGTH + WALL_THICKNESS, WALL_THICKNESS);
    wallAt(x, -CAR_WIDTH / 2 - WALL_THICKNESS / 2, CAR_LENGTH + WALL_THICKNESS, WALL_THICKNESS);
  }

  // The outer ends of the train are closed; the inner ends have a door.
  const leftEdge = carCentreX(0) - CAR_LENGTH / 2 - WALL_THICKNESS / 2;
  const rightEdge = carCentreX(carCount - 1) + CAR_LENGTH / 2 + WALL_THICKNESS / 2;
  wallAt(leftEdge, 0, WALL_THICKNESS, CAR_WIDTH + WALL_THICKNESS * 2);
  wallAt(rightEdge, 0, WALL_THICKNESS, CAR_WIDTH + WALL_THICKNESS * 2);

  for (let index = 0; index < carCount - 1; index += 1) {
    const x = carCentreX(index) + CAR_LENGTH / 2 + CAR_GAP / 2;
    const sideWidth = (CAR_WIDTH - DOOR_WIDTH) / 2;

    // Two wall pieces per inner end, leaving a doorway in the middle.
    wallAt(x, (DOOR_WIDTH + sideWidth) / 2, WALL_THICKNESS, sideWidth);
    wallAt(x, -(DOOR_WIDTH + sideWidth) / 2, WALL_THICKNESS, sideWidth);

    doors.push({ x, z: 0, width: CAR_GAP + WALL_THICKNESS, depth: DOOR_WIDTH, fromCar: index, toCar: index + 1 });
  }

  return { cars, walls, doors };
}
