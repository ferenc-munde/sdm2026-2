// Scrolling scenery behind the train (#25).
//
// The train stays in place; the sleepers on the ground move past it at a speed
// that follows `journey.speedFactor` from the server state: full speed, half at
// low fuel, stopped when the train stalls. Pure presentation: no game state is
// touched here.

import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Material } from "three";

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
export const SCENERY_Y = -14;

/** Extra ground around the train, so the edge of the world is never in view. */
const GROUND_MARGIN = 600;

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

/** Builds the ground and the sleepers around the train. */
export function buildScenery(bounds: SceneryBounds): Scenery {
  const group = new Group();
  group.name = "scenery";

  const groundMaterial = new MeshStandardMaterial({ color: 0x15151c, roughness: 1 });
  const ground = new Mesh(
    new BoxGeometry(bounds.right - bounds.left + GROUND_MARGIN, 6, bounds.depth + GROUND_MARGIN),
    groundMaterial,
  );
  ground.position.set((bounds.left + bounds.right) / 2, SCENERY_Y - 5, 0);
  ground.name = "ground";
  group.add(ground);

  const sleeperGeometry = new BoxGeometry(SLEEPER_SIZE.width, SLEEPER_SIZE.height, SLEEPER_SIZE.depth);
  const sleeperMaterial = new MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.9 });

  const first = bounds.left - SLEEPER_SPACING * 2;
  const last = bounds.right + SLEEPER_SPACING * 2;
  for (let x = first; x <= last; x += SLEEPER_SPACING) {
    const sleeper = new Mesh(sleeperGeometry, sleeperMaterial);
    sleeper.position.set(x, SCENERY_Y, 0);
    sleeper.name = "sleeper";
    sleeper.userData = { kind: "sleeper" };
    group.add(sleeper);
  }

  let distance = 0;

  return {
    group,
    update(deltaSeconds: number, speedFactor: number): void {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      distance += deltaSeconds * clampFactor(speedFactor) * SCENERY_FULL_SPEED;
      group.position.x = sceneryOffset(distance);
    },
    dispose(): void {
      group.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material.dispose();
        }
      });
    },
  };
}
