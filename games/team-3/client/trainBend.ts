// Train bend (#384): during a sharp curve each car follows the bend behind the one in front, like
// a real train. Drawing only: the rules keep working in the straight train, so movement,
// collisions and the room are unchanged. Every drawn object keeps a straight "rest" position in
// train coordinates; the bend moves and turns it with the car it stands in.
//
// The cars form a chain. Car 0 (with the locomotive in front of it) pivots at its front
// coupling; every next car hangs off the rear coupling of the car before it, so the train stays
// joined at every angle. Angles are about the vertical axis, in Three.js `rotation.y` terms.

import { CAR_GAP, type TrainMap } from "../shared/map/map.ts";

/** Largest angle a car turns in a curve: about 20°. */
export const MAX_BEND = 0.35;
/** Seconds for a car to go from straight to fully bent, or back. */
export const BEND_SECONDS = 0.9;

export interface Point {
  x: number;
  z: number;
}

/** Where a car is in the chain right now: its front coupling and its angle. */
export interface CarPose {
  joint: Point;
  angle: number;
}

/** The rest (straight) front coupling of each car: the middle of the gap in front of it. */
export function restFronts(map: TrainMap): Point[] {
  return map.cars.map((car, i) => ({ x: car.x - car.width / 2 - (i === 0 ? 0 : CAR_GAP / 2), z: car.y }));
}

/** Which car a straight-train x belongs to. The locomotive (in front of car 0) goes with car 0. */
export function carIndexAt(fronts: readonly Point[], x: number): number {
  let index = 0;
  for (let i = 1; i < fronts.length; i++) if (x >= fronts[i]!.x) index = i;
  return index;
}

/** Turns an x/z offset by `angle`, the same way `rotation.y = angle` turns an object. */
export function turn(dx: number, dz: number, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

/** The chain for the given per-car angles: car 0 stays at its rest front, the rest follow. */
export function chain(fronts: readonly Point[], angles: readonly number[]): CarPose[] {
  const poses: CarPose[] = [];
  let joint = { ...fronts[0]! };
  fronts.forEach((front, i) => {
    const angle = angles[i] ?? 0;
    poses.push({ joint, angle });
    const next = fronts[i + 1];
    if (next) {
      const step = turn(next.x - front.x, next.z - front.z, angle);
      joint = { x: joint.x + step.x, z: joint.z + step.z };
    }
  });
  return poses;
}

/** Where a straight-train point is drawn in car `index`'s current pose. */
export function bendPoint(fronts: readonly Point[], poses: readonly CarPose[], index: number, p: Point): Point {
  const front = fronts[index]!;
  const pose = poses[index]!;
  const offset = turn(p.x - front.x, p.z - front.z, pose.angle);
  return { x: pose.joint.x + offset.x, z: pose.joint.z + offset.z };
}

const smooth = (v: number): number => v * v * (3 - 2 * v);

/** Seconds each car lags behind the car in front of it. */
export const CAR_DELAY_SECONDS = 0.3;

/**
 * Per-car bend progress (0 straight, 1 fully bent). Car 0 eases towards the target; car i repeats
 * what car 0 did i × CAR_DELAY_SECONDS ago, so the bend runs down the train and straightens the
 * same way.
 */
export function createBendState(carCount: number) {
  let now = 0;
  let front = 0;
  const history: { t: number; v: number }[] = [{ t: 0, v: 0 }];
  const progress = new Array<number>(carCount).fill(0);
  const valueAt = (t: number): number => {
    let v = history[0]!.v;
    for (const sample of history) {
      if (sample.t > t) break;
      v = sample.v;
    }
    return v;
  };
  return {
    progress,
    /** Advances by `dt` towards bent (`active`) or straight; returns each car's angle. */
    step(dt: number, active: boolean): number[] {
      now += dt;
      const rate = dt / BEND_SECONDS;
      front = active ? Math.min(1, front + rate) : Math.max(0, front - rate);
      history.push({ t: now, v: front });
      const oldest = now - CAR_DELAY_SECONDS * carCount - 1;
      while (history.length > 2 && history[1]!.t < oldest) history.shift();
      for (let i = 0; i < carCount; i++) progress[i] = valueAt(now - i * CAR_DELAY_SECONDS);
      return progress.map((v) => MAX_BEND * smooth(v));
    },
    /** True while every car is straight, so the scene can skip the work. */
    isStraight(): boolean {
      return progress.every((v) => v === 0);
    },
  };
}
