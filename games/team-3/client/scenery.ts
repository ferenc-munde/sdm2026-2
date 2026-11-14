// Scrolling scenery behind the train (#25).
//
// The train stays in place; the sleepers on the ground move past it at a speed
// that follows `journey.speedFactor` from the server state: full speed, half at
// low fuel, stopped when the train stalls. Pure presentation: no game state is
// touched here.

import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, type Object3D } from "three";
import { PALETTE, mat, seeded } from "./style.ts";

/**
 * Visual speed of the scenery at full train speed, in world units per second.
 * Presentation only: unrelated to TRAIN_FULL_SPEED (10 world units/s) in the rules.
 */
export const SCENERY_FULL_SPEED = 160;
/** Distance between two sleepers, in world units. */
export const SLEEPER_SPACING = 90;
/** Sleepers are a little wider than the train, so they show on both sides of it. */
export const SLEEPER_SIZE = { width: 26, height: 6, depth: 360 } as const;
/** Height of the sleepers below the train floor, so they show beside and between the cars. */
export const SCENERY_Y = -45; // low enough for the wheels to stand on the rails (visual pass)

/** Extra ground around the train, so the edge of the world is never in view. */
const GROUND_MARGIN = 2400;
/** The steel rails' cross-section, in world units. */
export const RAIL_SIZE = { width: 8, height: 6 } as const;
/** How far each rail sits from the track centre: just outside the car walls, on the sleepers. */
export function railOffset(carDepth: number): number {
  return Math.min(SLEEPER_SIZE.depth / 2 - 12, carDepth / 2 + 30);
}
const POLE_HEIGHT = 130;
/** A pole every this many sleepers; a whole number so the scenery still loops seamlessly. */
const POLE_EVERY = 4;
const POLE_GAP = 170;

export interface SceneryBounds {
  /** x of the front of the train. */
  left: number;
  /** x of the back of the train. */
  right: number;
  /** Size across the train. */
  depth: number;
}

export interface Scenery {
  group: Group;
  /** Moves the sleepers by `deltaSeconds` of travel at `speedFactor`. */
  update(deltaSeconds: number, speedFactor: number): void;
  dispose(): void;
}

/** Positive modulo, so the offset stays in `[0, spacing)` for any distance. */
function positiveMod(value: number, spacing: number): number {
  return ((value % spacing) + spacing) % spacing;
}

/**
 * How far the sleepers are shifted after travelling `distance`, wrapped to one
 * spacing so a finite line of sleepers can scroll forever.
 *
 * Car 0 (the engine) is at the low-x end, the front of the train, and the train
 * travels towards -x. The ground therefore appears to slide towards +x, so the
 * offset is positive.
 */
export function sceneryOffset(distance: number, spacing: number = SLEEPER_SPACING): number {
  if (!Number.isFinite(distance) || !Number.isFinite(spacing) || spacing <= 0) return 0;
  return positiveMod(distance, spacing);
}

/** The server sends 0, 0.5 or 1; anything else is clamped into that range. */
function clampFactor(factor: number): number {
  if (!Number.isFinite(factor)) return 0;
  return Math.min(1, Math.max(0, factor));
}

/** How often the countryside pattern repeats; long enough that the repeat isn't noticed. */
const COUNTRYSIDE_PERIOD = SLEEPER_SPACING * 20;
const POLE_PERIOD = SLEEPER_SPACING * POLE_EVERY;

function put(parent: Object3D, mesh: Mesh, x: number, y: number, z: number, kind: string): Mesh {
  mesh.position.set(x, y, z);
  mesh.userData = { kind };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Builds the countryside around the track: ground, ballast, sleepers, rails, telegraph poles,
 * trees, bushes and rocks. The root group is the sleeper loop (it scrolls and wraps every sleeper
 * spacing); poles and countryside are child layers with their own, longer loops, so nothing ever
 * jumps when a loop wraps.
 */
export function buildScenery(bounds: SceneryBounds): Scenery {
  const group = new Group();
  group.name = "scenery";
  const centre = (bounds.left + bounds.right) / 2;
  const length = bounds.right - bounds.left + GROUND_MARGIN;

  const ground = put(group, new Mesh(new BoxGeometry(length, 6, GROUND_MARGIN * 1.5), mat(PALETTE.grass, { roughness: 1 })), centre, SCENERY_Y - 8, 0, "ground");
  ground.name = "ground";
  put(group, new Mesh(new BoxGeometry(length, 8, SLEEPER_SIZE.depth + 70), mat(PALETTE.ballast, { roughness: 1 })), centre, SCENERY_Y - 4, 0, "ballast");

  const first = bounds.left - SLEEPER_SPACING * 4;
  const last = bounds.right + SLEEPER_SPACING * 4;
  const sleeperGeometry = new BoxGeometry(SLEEPER_SIZE.width, SLEEPER_SIZE.height, SLEEPER_SIZE.depth);
  const sleeperMaterial = mat(PALETTE.sleeper, { roughness: 0.9 });
  for (let x = first; x <= last; x += SLEEPER_SPACING) {
    const sleeper = put(group, new Mesh(sleeperGeometry, sleeperMaterial), x, SCENERY_Y, 0, "sleeper");
    sleeper.name = "sleeper";
  }

  // Two steel rails along the sleepers (#217), outside the car walls so they show beside the train.
  const railGeometry = new BoxGeometry(length, RAIL_SIZE.height, RAIL_SIZE.width);
  const railMaterial = mat(PALETTE.rail, { metalness: 0.7, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const rail = put(group, new Mesh(railGeometry, railMaterial), centre, SCENERY_Y + SLEEPER_SIZE.height / 2 + RAIL_SIZE.height / 2, side * railOffset(bounds.depth), "rail");
    rail.name = "rail";
  }

  // Telegraph poles behind the train, with a wire between them.
  const poles = new Group();
  poles.name = "poles";
  group.add(poles);
  const wood = mat(PALETTE.trunk, { roughness: 0.9 });
  const poleZ = -(bounds.depth / 2 + POLE_GAP);
  for (let x = first - POLE_PERIOD; x <= last + POLE_PERIOD; x += POLE_PERIOD) {
    const pole = put(poles, new Mesh(new CylinderGeometry(3, 4, POLE_HEIGHT, 6), wood), x, SCENERY_Y + POLE_HEIGHT / 2, poleZ, "pole");
    pole.name = "pole";
    put(pole, new Mesh(new BoxGeometry(5, 4, 40), wood), 0, POLE_HEIGHT / 2 - 10, 0, "poleArm");
  }
  put(poles, new Mesh(new BoxGeometry(length, 0.8, 0.8), mat("#22252b")), centre, SCENERY_Y + POLE_HEIGHT - 12, poleZ + 14, "wire");

  // Countryside: one tile of trees, bushes and rocks, repeated along the line so it loops cleanly.
  const countryside = new Group();
  countryside.name = "countryside";
  group.add(countryside);
  const random = seeded(7);
  const tile: { dx: number; z: number; kind: "tree" | "bush" | "rock"; size: number }[] = [];
  for (let n = 0; n < 26; n += 1) {
    // Far side (behind the train): trees and bushes. Near side (in front of the camera): low bushes and rocks only.
    const farSide = n < 18;
    const z = farSide ? -(bounds.depth / 2 + 230 + random() * 700) : bounds.depth / 2 + 190 + random() * 260;
    const kind = farSide ? (random() < 0.65 ? "tree" : "bush") : random() < 0.6 ? "bush" : "rock";
    tile.push({ dx: random() * COUNTRYSIDE_PERIOD, z, kind, size: 0.7 + random() * 0.7 });
  }
  const leaves = [mat(PALETTE.leaves), mat(PALETTE.leavesLight)];
  const trunkGeometry = new CylinderGeometry(5, 7, 40, 6);
  const lowerCrown = new ConeGeometry(34, 60, 7);
  const upperCrown = new ConeGeometry(26, 46, 7);

  // Grass patches in two shades (#358): flat discs just above the ground, so the field reads as
  // moving past instead of a flat sheet. They catch shadows but cast none.
  const patches: { dx: number; z: number; r: number; light: boolean }[] = [];
  for (let n = 0; n < 34; n += 1) {
    const side = n % 3 === 0 ? 1 : -1;
    const z = side * (bounds.depth / 2 + 120 + random() * (side > 0 ? 360 : 900));
    patches.push({ dx: random() * COUNTRYSIDE_PERIOD, z, r: 30 + random() * 70, light: random() < 0.5 });
  }
  const patchGeometry = new CylinderGeometry(1, 1, 0.6, 7);
  const patchMaterials = [mat(PALETTE.grassLight, { roughness: 1 }), mat(PALETTE.grassDark, { roughness: 1 })];

  // A wooden fence along the near side (#358), between the track and the field.
  const fenceZ = bounds.depth / 2 + 150;
  const fenceMaterial = mat(PALETTE.fence, { roughness: 0.9 });
  const postGeometry = new BoxGeometry(4, 24, 4);
  const fenceRail = new BoxGeometry(COUNTRYSIDE_PERIOD, 2.5, 2);
  const FENCE_POST_SPACING = SLEEPER_SPACING;

  for (let start = first - COUNTRYSIDE_PERIOD; start <= last + COUNTRYSIDE_PERIOD; start += COUNTRYSIDE_PERIOD) {
    tile.forEach((spot, index) => {
      const x = start + spot.dx;
      const foliage = leaves[index % 2]!;
      if (spot.kind === "tree") {
        const tree = new Group();
        tree.position.set(x, SCENERY_Y - 5, spot.z);
        tree.scale.setScalar(spot.size);
        tree.userData = { kind: "tree" };
        put(tree, new Mesh(trunkGeometry, wood), 0, 20, 0, "trunk");
        put(tree, new Mesh(lowerCrown, foliage), 0, 62, 0, "foliage");
        put(tree, new Mesh(upperCrown, foliage), 0, 92, 0, "foliage");
        countryside.add(tree);
      } else if (spot.kind === "bush") {
        put(countryside, new Mesh(new DodecahedronGeometry(16 * spot.size, 0), foliage), x, SCENERY_Y + 4, spot.z, "bush");
      } else {
        put(countryside, new Mesh(new DodecahedronGeometry(11 * spot.size, 0), mat(PALETTE.rock)), x, SCENERY_Y, spot.z, "rock");
      }
    });
    patches.forEach((patch, index) => {
      const disc = put(countryside, new Mesh(patchGeometry, patchMaterials[patch.light ? 0 : 1]!), start + patch.dx, SCENERY_Y - 4.6 + (index % 3) * 0.05, patch.z, "grassPatch");
      disc.scale.set(patch.r, 1, patch.r * 0.7);
      disc.castShadow = false;
    });
    for (let x = start; x < start + COUNTRYSIDE_PERIOD; x += FENCE_POST_SPACING) {
      put(countryside, new Mesh(postGeometry, fenceMaterial), x, SCENERY_Y + 7, fenceZ, "fencePost");
    }
    for (const y of [SCENERY_Y + 10, SCENERY_Y + 16]) {
      put(countryside, new Mesh(fenceRail, fenceMaterial), start + COUNTRYSIDE_PERIOD / 2, y, fenceZ, "fenceRail");
    }
  }

  let distance = 0;
  const place = (): void => {
    group.position.x = sceneryOffset(distance);
    // Child layers loop on their own periods: world offset = layer offset, so cancel the root's.
    poles.position.x = sceneryOffset(distance, POLE_PERIOD) - group.position.x;
    countryside.position.x = sceneryOffset(distance, COUNTRYSIDE_PERIOD) - group.position.x;
  };

  return {
    group,
    update(deltaSeconds: number, speedFactor: number): void {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      distance += deltaSeconds * clampFactor(speedFactor) * SCENERY_FULL_SPEED;
      place();
    },
    dispose(): void {
      const geometries = new Set<{ dispose(): void }>();
      group.traverse((child) => {
        if (child instanceof Mesh) geometries.add(child.geometry);
      });
      for (const geometry of geometries) geometry.dispose();
      // Materials are shared through style.ts and stay cached for the next scene.
    },
  };
}
