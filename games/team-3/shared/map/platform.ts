// The lobby platform (#148): where the crew waits before departure, walking around while
// others join ("Waiting on the platform", design on #12). A walled floor with the train
// along the back (doors closed), the player starts, and the positions of the platform
// objects from #153: departure lever, practice coal pile and boiler, practice wrench and
// breach, and the how-to-play boards.
//
// Same coordinates as the train map: floor positions (x along, y across), drawn by the
// client at (x, 0, y), with boxes given by centre and size.

import { MAX_PLAYERS, PLAYER_RADIUS } from "../constants.ts";
import type { PlatformObjectLayout } from "../stations/platform.ts";
import type { Vec2 } from "../types.ts";
import { WALL_THICKNESS, insideBox, type FloorBox } from "./map.ts";

/** Length of the platform along the train. */
export const PLATFORM_LENGTH = 900;
/** Depth of the platform from the train (back, -y) to the platform edge (front, +y). */
export const PLATFORM_DEPTH = 260;
/** Objects keep at least this far apart, so standing at one never reaches another. */
export const OBJECT_SPACING = 2 * PLAYER_RADIUS + 16;

export interface PlatformMap {
  /** The walkable floor. */
  floor: FloorBox;
  /** Solid boxes: the train along the back, the platform edge and both ends. */
  walls: FloorBox[];
  /** Start positions, one per seat, in seat order. */
  playerSpawns: Vec2[];
  /** Where the platform objects (#153) stand. */
  objects: PlatformObjectLayout;
}

/** The waiting platform. */
export function createPlatformMap(): PlatformMap {
  const halfX = PLATFORM_LENGTH / 2;
  const halfY = PLATFORM_DEPTH / 2;
  const t = WALL_THICKNESS;
  const floor: FloorBox = { x: 0, y: 0, width: PLATFORM_LENGTH, depth: PLATFORM_DEPTH };
  const walls: FloorBox[] = [
    { x: 0, y: -halfY - t / 2, width: PLATFORM_LENGTH + 2 * t, depth: t }, // the train, doors closed
    { x: 0, y: halfY + t / 2, width: PLATFORM_LENGTH + 2 * t, depth: t }, // the platform edge
    { x: -halfX - t / 2, y: 0, width: t, depth: PLATFORM_DEPTH }, // left end
    { x: halfX + t / 2, y: 0, width: t, depth: PLATFORM_DEPTH }, // right end
  ];
  const objects: PlatformObjectLayout = {
    // Practice corner on the left: coal pile, then the boiler a short carry away.
    coalPile: { x: -380, y: 70 },
    boiler: { x: -250, y: 70 },
    // Practice repair in the middle-right: wrench rack and the practice breach.
    wrench: { x: 140, y: 90 },
    breach: { x: 260, y: 40 },
    // The departure lever at the right end, by the train.
    departureLever: { x: 390, y: -90 },
    // How-to-play boards against the train: one by the practice corner, one in the middle.
    boards: [
      { x: -380, y: -90 },
      { x: -40, y: -90 },
    ],
  };
  const playerSpawns: Vec2[] = [
    { x: -60, y: 10 },
    { x: 20, y: 10 },
    { x: -60, y: 60 },
    { x: 20, y: 60 },
  ];
  return { floor, walls, playerSpawns, objects };
}

/** Every object position on the platform, with a name for messages. */
export function platformObjects(map: PlatformMap): { name: string; position: Vec2 }[] {
  const { objects } = map;
  return [
    { name: "departure lever", position: objects.departureLever },
    { name: "coal pile", position: objects.coalPile },
    { name: "boiler", position: objects.boiler },
    { name: "wrench", position: objects.wrench },
    { name: "breach", position: objects.breach },
    ...objects.boards.map((position, i) => ({ name: `board ${i + 1}`, position })),
  ];
}

const apart = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Returns the problems with a platform map; an empty list means it is usable. */
export function validatePlatform(map: PlatformMap): string[] {
  const problems: string[] = [];
  const standable = (p: Vec2): boolean => insideBox(map.floor, p, PLAYER_RADIUS);

  if (map.playerSpawns.length < MAX_PLAYERS) problems.push(`the platform needs ${MAX_PLAYERS} player starts`);
  map.playerSpawns.forEach((spawn, seat) => {
    if (!standable(spawn)) problems.push(`player start ${seat} is not on the platform`);
    map.playerSpawns.slice(seat + 1).forEach((other, i) => {
      if (apart(spawn, other) < 2 * PLAYER_RADIUS) problems.push(`player starts ${seat} and ${seat + 1 + i} overlap`);
    });
  });

  const objects = platformObjects(map);
  if (map.objects.boards.length === 0) problems.push("the platform needs a how-to-play board");
  objects.forEach((object, i) => {
    if (!standable(object.position)) problems.push(`${object.name} is not on the platform`);
    objects.slice(i + 1).forEach((other) => {
      if (apart(object.position, other.position) < OBJECT_SPACING) problems.push(`${object.name} and ${other.name} are too close`);
    });
    map.playerSpawns.forEach((spawn, seat) => {
      if (apart(object.position, spawn) < OBJECT_SPACING) problems.push(`${object.name} is too close to player start ${seat}`);
    });
  });
  return problems;
}

/** Where the player in `seat` (0 for the first to join) starts on the platform. */
export function platformSpawn(map: PlatformMap, seat: number): Vec2 {
  const spawn = map.playerSpawns[seat % map.playerSpawns.length] ?? map.floor;
  return { x: spawn.x, y: spawn.y };
}
