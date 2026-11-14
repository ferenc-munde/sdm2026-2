// Crew and wheel animation (#294). Drawing only: the room stays the authority for positions.
//
// The room sends positions about 20 times a second and the screen draws about 60. These helpers
// turn the distance a figure actually moved into a walk phase and a pose, so legs and arms swing
// at the speed the figure moves and settle when it stands still. The scenes apply the result to
// their meshes; nothing in `shared/` changes.

import { PLAYER_SPEED, TRAIN_FULL_SPEED } from "../shared/constants.ts";
import type { Vec2 } from "../shared/types.ts";

/** A full leg/arm swing at the walking speed from the shared rules. */
export const WALK_FULL_SPEED = PLAYER_SPEED;
/** Radians of walk phase per world unit walked: about two steps a second at full speed. */
export const WALK_RAD_PER_UNIT = 0.08;
export const MAX_LEG_SWING = 0.65;
export const MAX_ARM_SWING = 0.45;
export const WALK_BOB = 2.2;
export const IDLE_BOB = 1.2;
export const CARRY_ARM_LIFT = 1.15;
export const INTERACT_ARM_LIFT = 1.35;
/** Drawn wheel radius; the ground speed / radius gives the roll. */
export const WHEEL_RADIUS = 9;

export interface PoseInput {
  /** How fast the figure is actually moving, in world units per second. */
  speed: number;
  /** Walk-cycle phase in radians, advanced with `advanceWalk`. */
  phase: number;
  /** Seconds since the figure was built, for the idle breathing bob. */
  seconds: number;
  /** Arms forward while an item is held. */
  carrying: boolean;
  /** The local player holds the interact key; wins over `carrying`. */
  interacting: boolean;
}

export interface CrewPose {
  /** Left-leg angle around local z; the right leg gets the opposite. */
  legSwing: number;
  /** Left-arm angle around local z; the right arm gets the opposite. */
  armSwing: number;
  /** Upward offset of the torso, head and held item. */
  bob: number;
  /** Forward lift of both arms: 0 down, ~1.35 out in front. */
  armLift: number;
}

/** 0 when still, 1 at the full walking speed (and above). */
export function walkAmount(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(1, speed / WALK_FULL_SPEED);
}

/** Advances the walk cycle by the distance walked in `dt` seconds. */
export function advanceWalk(phase: number, speed: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return phase;
  const walked = Number.isFinite(speed) ? Math.max(0, speed) * dt : 0;
  return phase + walked * WALK_RAD_PER_UNIT;
}

/**
 * The pose for one frame. Moving: legs and opposite arms swing with the phase, plus a small
 * vertical bob. Still: a slow breathing bob. Carrying lifts both arms; interacting lifts them a
 * little further and takes over from the carry pose.
 */
export function crewPose(input: PoseInput): CrewPose {
  const amount = walkAmount(input.speed);
  const moving = amount > 0.01;
  const swing = Math.sin(input.phase);
  const armLift = input.interacting
    ? INTERACT_ARM_LIFT
    : input.carrying
      ? CARRY_ARM_LIFT
      : 0;
  const legSwing = moving ? MAX_LEG_SWING * amount * swing : 0;
  return {
    legSwing,
    armSwing: armLift === 0 && moving ? -(MAX_ARM_SWING / MAX_LEG_SWING) * legSwing : 0,
    bob: moving
      ? WALK_BOB * amount * Math.abs(swing)
      : IDLE_BOB * (0.5 + 0.5 * Math.sin(input.seconds * 2.2)),
    armLift,
  };
}

/** Local +x is the resting facing; a facing direction turns the figure, a zero one leaves it at 0. */
export function headingFor(facing?: { dx: number; dy: number }): number {
  if (!facing || (facing.dx === 0 && facing.dy === 0)) return 0;
  const angle = -Math.atan2(facing.dy, facing.dx);
  return angle === 0 ? 0 : angle; // never return -0, so callers can compare with 0
}

/**
 * Eases an angle toward `target` the shortest way round (#355), so a figure never spins the long
 * way through 360 degrees. The wrap is in (-pi, pi].
 */
export function easeAngle(current: number, target: number, dt: number, rate = 12): number {
  if (!Number.isFinite(dt) || dt <= 0) return current;
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-rate * dt));
}

/** World units per second between two drawn positions; 0 for an invalid frame time. */
export function speedBetween(from: Vec2, to: Vec2, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.hypot(to.x - from.x, to.y - from.y) / dt;
}

/**
 * Eases the measured speed, so a 20 Hz position update does not make the swing jump. A single
 * large jump (boarding, play again) is capped, not turned into a sprint.
 */
export function smoothSpeed(previous: number, measured: number, dt: number, rate = 10): number {
  const next = Number.isFinite(measured) ? Math.min(Math.max(0, measured), WALK_FULL_SPEED * 2) : 0;
  if (!Number.isFinite(dt) || dt <= 0) return previous;
  return previous + (next - previous) * (1 - Math.exp(-rate * dt));
}

/** A wheel's roll after `dt` seconds at `speedFactor`, from the train's ground speed. */
export function wheelAngle(angle: number, speedFactor: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return angle;
  const factor = Number.isFinite(speedFactor) ? Math.max(0, Math.min(1, speedFactor)) : 0;
  return angle + (TRAIN_FULL_SPEED * factor * dt) / WHEEL_RADIUS;
}
