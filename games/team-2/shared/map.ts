/**
 * Train geometry shared by the rules (movement bounds, spawn points) and the
 * client artwork. Units are map units: x grows to the right, y grows downwards,
 * on the 1600 × 1000 map the client draws. No colours or labels here.
 */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1000;
export const CAR_COUNT = 5;
export const CAR_WIDTH = 220;
export const CAR_HEIGHT = 158;
export const CAR_SPACING = 168;
export const CAR_X = 690;
export const CAR_START_Y = 50;
/** Passage (bulkhead) opening on the central aisle. */
export const PASSAGE_X = 778;
export const PASSAGE_WIDTH = 44;
/** A player is a disc of this radius; it never crosses a wall. */
export const PLAYER_RADIUS = 8;

/** Wall thickness of the drawn carriage: the floor is the bounds minus this inset. */
const WALL_X = 8;
const WALL_Y = 7;
/** How far a passage corridor reaches into the two floors it connects. */
const PASSAGE_OVERLAP = 6;

export function carBounds(index: number): Rect {
	return { x: CAR_X, y: CAR_START_Y + index * CAR_SPACING, width: CAR_WIDTH, height: CAR_HEIGHT };
}

/** Where the centre of a player may be inside one carriage. */
export function carFloor(index: number): Rect {
	const car = carBounds(index);
	return {
		x: car.x + WALL_X + PLAYER_RADIUS,
		y: car.y + WALL_Y + PLAYER_RADIUS,
		width: car.width - 2 * (WALL_X + PLAYER_RADIUS),
		height: car.height - 2 * (WALL_Y + PLAYER_RADIUS),
	};
}

/** The corridor between carriage `fromCar` and the next one; it overlaps both floors. */
export function passageFloor(fromCar: number): Rect {
	const from = carFloor(fromCar);
	const to = carFloor(fromCar + 1);
	const top = from.y + from.height - PASSAGE_OVERLAP;
	return {
		x: PASSAGE_X + PLAYER_RADIUS,
		y: top,
		width: PASSAGE_WIDTH - 2 * PLAYER_RADIUS,
		height: to.y + PASSAGE_OVERLAP - top,
	};
}

export const CAR_FLOORS: readonly Rect[] = Array.from({ length: CAR_COUNT }, (_, index) => carFloor(index));
export const PASSAGE_FLOORS: readonly Rect[] = Array.from({ length: CAR_COUNT - 1 }, (_, index) => passageFloor(index));
/** Every place a player may stand: the union of these rectangles. */
export const WALKABLE: readonly Rect[] = [...CAR_FLOORS, ...PASSAGE_FLOORS];

export function contains(rect: Rect, x: number, y: number): boolean {
	return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Carriage whose floor holds the point, or -1 (for example inside a passage). */
export function carIndexAt(x: number, y: number): number {
	return CAR_FLOORS.findIndex((floor) => contains(floor, x, y));
}

/** Everyone boards in the Mechanical Junction (carriage 3), on its central aisle. */
export const SPAWN_CAR = 2;
const SPAWN_OFFSETS: readonly (readonly [number, number])[] = [
	[-10, -14],
	[10, -14],
	[-10, 14],
	[10, 14],
];

export function spawnPoint(slot: number): { carIndex: number; x: number; y: number } {
	const car = carBounds(SPAWN_CAR);
	const [dx, dy] = SPAWN_OFFSETS[Math.abs(Math.trunc(slot)) % SPAWN_OFFSETS.length]!;
	return { carIndex: SPAWN_CAR, x: car.x + car.width / 2 + dx, y: car.y + car.height / 2 + dy };
}
