// The hazard director: starts a new breach or fire on a free spot on a timer.
// Pure and deterministic: the same state, spots, elapsed time and random source
// always give the same result.

import {
  HAZARD_INTERVAL_LATE_SECONDS,
  HAZARD_INTERVAL_SECONDS,
  HAZARD_LATE_PROGRESS,
  WIN_DISTANCE,
} from "../constants.ts";
import type { GameState, Hazard, HazardKind, Vec2 } from "../types.ts";
import { pickIndex, type RandomSource } from "./random.ts";

/** A place on the map where a hazard can start. The list comes from the map data (#6). */
export interface HazardSpot {
  id: string;
  car: number;
  position: Vec2;
}

/** The director's own bookkeeping, kept next to the game state. */
export interface DirectorState {
  /** Seconds until the next hazard starts. Zero means "as soon as a spot is free". */
  secondsUntilNext: number;
  /** How many hazards this run has started; used to give each one a unique id. */
  spawnedCount: number;
}

/** The hazard kinds the director starts. The course hazard (#28) has its own trigger. */
export const DIRECTOR_HAZARD_KINDS: readonly HazardKind[] = ["breach", "fire"];

/** A fresh director for a new run: the first hazard comes after one full interval. */
export function createDirector(): DirectorState {
  return { secondsUntilNext: HAZARD_INTERVAL_SECONDS, spawnedCount: 0 };
}

/** How far the train has travelled, from 0 (start) to 1 (destination). */
export function journeyProgress(state: GameState): number {
  return Math.min(1, Math.max(0, state.journey.distance / WIN_DISTANCE));
}

/** Seconds between hazards: 12, and 7 once more than 65% of the distance is covered. */
export function hazardInterval(progress: number): number {
  return progress > HAZARD_LATE_PROGRESS ? HAZARD_INTERVAL_LATE_SECONDS : HAZARD_INTERVAL_SECONDS;
}

/** The spots that have no hazard on them. */
export function freeSpots(spots: readonly HazardSpot[], hazards: GameState["hazards"]): HazardSpot[] {
  const busy = new Set(Object.values(hazards).map((hazard) => hazard.spotId));
  return spots.filter((spot) => !busy.has(spot.id));
}

/**
 * Advances the director by `dt` seconds. When the timer runs out it starts one hazard on a
 * random free spot. If every spot is busy it waits and starts one as soon as a spot is free.
 * Does nothing outside the "playing" phase.
 */
export function stepDirector(
  director: DirectorState,
  state: GameState,
  spots: readonly HazardSpot[],
  dt: number,
  random: RandomSource,
): { director: DirectorState; state: GameState } {
  if (state.phase !== "playing" || dt <= 0) return { director, state };

  const remaining = director.secondsUntilNext - dt;
  if (remaining > 0) return { director: { ...director, secondsUntilNext: remaining }, state };

  const free = freeSpots(spots, state.hazards);
  if (free.length === 0) return { director: { ...director, secondsUntilNext: 0 }, state };

  const spot = free[pickIndex(random, free.length)] as HazardSpot;
  const kind = DIRECTOR_HAZARD_KINDS[pickIndex(random, DIRECTOR_HAZARD_KINDS.length)] as HazardKind;
  const spawnedCount = director.spawnedCount + 1;
  const hazard: Hazard = {
    id: `hazard-${spawnedCount}`,
    kind,
    car: spot.car,
    spotId: spot.id,
    position: { x: spot.position.x, y: spot.position.y },
    age: 0,
    progress: 0,
    countdown: null,
  };

  // `remaining` is zero or negative here: carry the overshoot so the rhythm does not drift.
  const next = Math.max(0, hazardInterval(journeyProgress(state)) + remaining);
  return {
    director: { secondsUntilNext: next, spawnedCount },
    state: { ...state, hazards: { ...state.hazards, [hazard.id]: hazard } },
  };
}
