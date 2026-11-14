import { TRAIN_SIZE, WALKABLE } from "./train-layout";

type Rect = { x: number; z: number; halfX: number; halfZ: number };
const radius = 0.34;
const obstacles: Rect[] = [];

function box(x: number, z: number, halfX: number, halfZ: number): void {
  obstacles.push({ x, z, halfX, halfZ });
}

for (let index = 1; index < 5; index++) {
  const x = -TRAIN_SIZE.length / 2 + index * 5.2;
  for (const side of [-1, 1]) box(x, side * 3.025, 0.18, 1.975);
}
box(-10.55, -3.25, 1.55, 1.025);
box(-10.4, 3.35, 1.35, 0.85);
for (const x of [-6.75, -5.2, -3.65]) {
  for (const z of [-3.65, 3.65]) box(x, z, 0.575, 0.725);
}
box(0, -3.45, 1.85, 0.675);
box(0, 2.4, 0.58, 0.58);
for (const x of [3.65, 5.2, 6.75]) {
  for (const z of [-3.15, 3.15]) box(x, z, 0.675, 0.675);
}
for (const x of [9.05, 11.75]) {
  box(x, -3.15, 0.8, 0.8);
  box(x, 3.25, 0.625, 0.85);
}
box(10.4, 0, 0.42, 0.42);

/** Coordinates are world units measured from the front/north edge of the walkable area. */
export function isTrainWalkable(x: number, z: number): boolean {
  if (x < 0 || x > WALKABLE.length || z < 0 || z > WALKABLE.width) return false;
  const worldX = x - WALKABLE.length / 2;
  const worldZ = z - WALKABLE.width / 2;
  return obstacles.every((rect) =>
    Math.abs(worldX - rect.x) >= rect.halfX + radius ||
    Math.abs(worldZ - rect.z) >= rect.halfZ + radius,
  );
}

/** Substeps prevent crossing thin walls at low frame rates or high server speeds. */
export function moveInTrain(x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1));
  for (let i = 0; i < steps; i++) {
    const nextX = Math.min(WALKABLE.length, Math.max(0, x + dx / steps));
    const nextZ = Math.min(WALKABLE.width, Math.max(0, z + dz / steps));
    if (isTrainWalkable(nextX, nextZ)) {
      x = nextX;
      z = nextZ;
    } else {
      if (isTrainWalkable(nextX, z)) x = nextX;
      if (isTrainWalkable(x, nextZ)) z = nextZ;
    }
  }
  return { x, z };
}
