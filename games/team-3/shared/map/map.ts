// The train map: three cars in a row, with walls, a narrow door between each pair of
// cars, and the positions of every station, hazard spot, item and player start.
//
// Coordinates are floor positions in world units (see Vec2 in ../types.ts).
// x runs along the train, from the engine at the front (car 0) to the last car.
// y runs across the train; the Three.js client draws (x, y) at scene (x, 0, y).
// Every box is given by its centre and its size, like the client's FloorBox.
//
// The sizes match the client's temporary layout (client/trainMap.ts, #10), so the
// renderer can switch to this map without changing how the train looks.

import { CAR_COUNT, PLAYER_RADIUS } from "../constants.ts";
import type { ItemKind, Station, StationKind, Vec2 } from "../types.ts";

/** Length of one car along the train. */
export const CAR_LENGTH = 420;
/** Width of one car across the train. */
export const CAR_WIDTH = 220;
/** Space between two cars, bridged by a door. */
export const CAR_GAP = 24;
/** Thickness of every wall. */
export const WALL_THICKNESS = 10;
/** Width of the opening between two cars: narrow on purpose, so carrying is a squeeze. */
export const DOOR_WIDTH = 100;

/** An axis-aligned box on the floor, given by its centre and size. */
export interface FloorBox {
  /** Centre along the train. */
  x: number;
  /** Centre across the train. */
  y: number;
  /** Size along the train (x). */
  width: number;
  /** Size across the train (y). */
  depth: number;
}

/** One car of the train. Its box is the walkable floor inside the walls. */
export interface CarLayout extends FloorBox {
  /** 0 is the engine car at the front. */
  index: number;
}

/** A doorway joining two neighbouring cars. Its box is the walkable floor across the gap. */
export interface DoorLayout extends FloorBox {
  fromCar: number;
  toCar: number;
}

/** A place where the hazard director may start a breach or fire (matches HazardSpot in run/director.ts). */
export interface HazardSpotLayout {
  id: string;
  car: number;
  position: Vec2;
}

/** Where an item lies when a run starts. */
export interface ItemSpawn {
  kind: ItemKind;
  position: Vec2;
}

export interface TrainMap {
  cars: CarLayout[];
  /** Solid boxes players cannot walk through. */
  walls: FloorBox[];
  doors: DoorLayout[];
  stations: Station[];
  hazardSpots: HazardSpotLayout[];
  itemSpawns: ItemSpawn[];
  /** Start positions, one per seat, in seat order. */
  playerSpawns: Vec2[];
}

/** The id of the hazard spot on the engine. A fire here stalls the train. */
export const ENGINE_SPOT_ID = "engine";

/** Stations every map must have. */
export const REQUIRED_STATIONS: readonly StationKind[] = [
  "engine",
  "coalDispenser",
  "wrenchRack",
  "extinguisherRack",
  "steeringConsole",
];

/** Centre of a car along the train. */
export function carCentreX(index: number): number {
  return index * (CAR_LENGTH + CAR_GAP);
}

/** A position relative to the centre of a car. */
function inCar(car: number, dx: number, dy: number): Vec2 {
  return { x: carCentreX(car) + dx, y: dy };
}

/** Builds the train's walls, cars and doors for `carCount` cars. */
function buildShell(carCount: number): Pick<TrainMap, "cars" | "walls" | "doors"> {
  const cars: CarLayout[] = [];
  const walls: FloorBox[] = [];
  const doors: DoorLayout[] = [];

  for (let index = 0; index < carCount; index += 1) {
    const x = carCentreX(index);
    cars.push({ index, x, y: 0, width: CAR_LENGTH, depth: CAR_WIDTH });
    // The two long side walls have no openings.
    walls.push({ x, y: CAR_WIDTH / 2 + WALL_THICKNESS / 2, width: CAR_LENGTH + WALL_THICKNESS, depth: WALL_THICKNESS });
    walls.push({ x, y: -CAR_WIDTH / 2 - WALL_THICKNESS / 2, width: CAR_LENGTH + WALL_THICKNESS, depth: WALL_THICKNESS });
  }

  // The outer ends of the train are closed.
  const endDepth = CAR_WIDTH + WALL_THICKNESS * 2;
  walls.push({ x: carCentreX(0) - CAR_LENGTH / 2 - WALL_THICKNESS / 2, y: 0, width: WALL_THICKNESS, depth: endDepth });
  walls.push({
    x: carCentreX(carCount - 1) + CAR_LENGTH / 2 + WALL_THICKNESS / 2,
    y: 0,
    width: WALL_THICKNESS,
    depth: endDepth,
  });

  // Between two cars: a wall piece on each side, leaving a door in the middle.
  const sideDepth = (CAR_WIDTH - DOOR_WIDTH) / 2;
  for (let index = 0; index < carCount - 1; index += 1) {
    const x = carCentreX(index) + CAR_LENGTH / 2 + CAR_GAP / 2;
    walls.push({ x, y: (DOOR_WIDTH + sideDepth) / 2, width: WALL_THICKNESS, depth: sideDepth });
    walls.push({ x, y: -(DOOR_WIDTH + sideDepth) / 2, width: WALL_THICKNESS, depth: sideDepth });
    doors.push({ x, y: 0, width: CAR_GAP, depth: DOOR_WIDTH, fromCar: index, toCar: index + 1 });
  }

  return { cars, walls, doors };
}

/**
 * The train of The Last Train.
 *
 * - Car 0, the engine car: the engine at the front and the steering console.
 * - Car 1, the middle car: the wrench and the extinguisher racks; the crew starts here.
 * - Car 2, the tender: the coal dispenser at the back, so coal has to be carried
 *   through both doors to reach the engine.
 */
export function createTrainMap(): TrainMap {
  const { cars, walls, doors } = buildShell(CAR_COUNT);

  const stations: Station[] = [
    { kind: "engine", car: 0, position: inCar(0, -160, 0) },
    { kind: "steeringConsole", car: 0, position: inCar(0, -160, -80) },
    { kind: "wrenchRack", car: 1, position: inCar(1, 0, 85) },
    { kind: "extinguisherRack", car: 1, position: inCar(1, 0, -85) },
    { kind: "coalDispenser", car: 2, position: inCar(2, 160, 0) },
  ];

  const hazardSpots: HazardSpotLayout[] = [
    { id: ENGINE_SPOT_ID, car: 0, position: inCar(0, -160, 0) },
    { id: "car0-a", car: 0, position: inCar(0, 60, 60) },
    { id: "car0-b", car: 0, position: inCar(0, 60, -60) },
    { id: "car1-a", car: 1, position: inCar(1, -130, 50) },
    { id: "car1-b", car: 1, position: inCar(1, 130, -50) },
    { id: "car2-a", car: 2, position: inCar(2, -130, -50) },
    { id: "car2-b", car: 2, position: inCar(2, 20, 60) },
  ];

  const itemSpawns: ItemSpawn[] = [
    { kind: "wrench", position: inCar(1, 0, 85) },
    { kind: "extinguisher", position: inCar(1, 0, -85) },
  ];

  const playerSpawns: Vec2[] = [inCar(1, -50, 25), inCar(1, 50, 25), inCar(1, -50, -25), inCar(1, 50, -25)];

  return { cars, walls, doors, stations, hazardSpots, itemSpawns, playerSpawns };
}

/** True when `point` is inside `box`, keeping at least `margin` away from its edges. */
export function insideBox(box: FloorBox, point: Vec2, margin = 0): boolean {
  return (
    Math.abs(point.x - box.x) <= box.width / 2 - margin && Math.abs(point.y - box.y) <= box.depth / 2 - margin
  );
}

/** The index of the car whose floor contains `point`, or null (for example in a doorway). */
export function carAt(map: TrainMap, point: Vec2): number | null {
  const car = map.cars.find((candidate) => insideBox(candidate, point));
  return car ? car.index : null;
}

/** The cars that can be reached from `start` by walking through doors. */
export function reachableCars(map: TrainMap, start = 0): Set<number> {
  const reached = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const car = queue.shift() as number;
    for (const door of map.doors) {
      const other = door.fromCar === car ? door.toCar : door.toCar === car ? door.fromCar : null;
      if (other !== null && !reached.has(other)) {
        reached.add(other);
        queue.push(other);
      }
    }
  }
  return reached;
}

/** Returns the problems with a map; an empty list means it is usable. */
export function validateMap(map: TrainMap): string[] {
  const problems: string[] = [];
  const carIndexes = new Set(map.cars.map((car) => car.index));

  // A point a player (or something a player must reach) can stand on: inside its car,
  // a full player radius away from the walls.
  const checkPlace = (what: string, car: number, position: Vec2): void => {
    const layout = map.cars.find((candidate) => candidate.index === car);
    if (!layout) problems.push(`${what} is in car ${car}, which does not exist`);
    else if (!insideBox(layout, position, PLAYER_RADIUS)) problems.push(`${what} is not inside car ${car}`);
  };

  if (map.cars.length === 0) problems.push("the map has no cars");

  for (const door of map.doors) {
    if (!carIndexes.has(door.fromCar) || !carIndexes.has(door.toCar)) {
      problems.push(`door ${door.fromCar}-${door.toCar} joins a car that does not exist`);
    } else if (Math.abs(door.fromCar - door.toCar) !== 1) {
      problems.push(`door ${door.fromCar}-${door.toCar} does not join neighbouring cars`);
    }
    if (door.depth < PLAYER_RADIUS * 2) problems.push(`door ${door.fromCar}-${door.toCar} is too narrow for a player`);
  }

  const reached = reachableCars(map);
  for (const index of carIndexes) {
    if (!reached.has(index)) problems.push(`car ${index} cannot be reached through a door`);
  }

  for (const kind of REQUIRED_STATIONS) {
    if (!map.stations.some((station) => station.kind === kind)) problems.push(`station ${kind} is missing`);
  }
  for (const station of map.stations) checkPlace(`station ${station.kind}`, station.car, station.position);

  const spotIds = new Set<string>();
  for (const spot of map.hazardSpots) {
    if (spotIds.has(spot.id)) problems.push(`hazard spot ${spot.id} is listed twice`);
    spotIds.add(spot.id);
    checkPlace(`hazard spot ${spot.id}`, spot.car, spot.position);
  }
  if (!spotIds.has(ENGINE_SPOT_ID)) problems.push(`hazard spot ${ENGINE_SPOT_ID} is missing`);

  for (const item of map.itemSpawns) {
    const car = carAt(map, item.position);
    if (car === null) problems.push(`item ${item.kind} does not start inside a car`);
    else checkPlace(`item ${item.kind}`, car, item.position);
  }

  map.playerSpawns.forEach((spawn, seat) => {
    const car = carAt(map, spawn);
    if (car === null) problems.push(`player start ${seat} is not inside a car`);
    else checkPlace(`player start ${seat}`, car, spawn);
  });

  return problems;
}
