// Starts course hazards on a fixed rhythm during a run.
//
// The course rule itself (warning, steering console, damage) lives in ../hazards/course.ts.
// This system only decides when an event begins. It keeps no state of its own: it reads the
// run clock, so it is deterministic and replays exactly.

import { startCourse } from "../hazards/course.ts";
import type { GameState, Station } from "../types.ts";
import type { HazardSpot } from "./director.ts";
import type { StepSystem } from "./session.ts";

/** Seconds of run time between course events. A starting value, tuned in the play-test (#27). */
export const COURSE_INTERVAL_SECONDS = 45;

/** The spot a course event sits on: the steering console's own, so no normal hazard spot is blocked. */
export const COURSE_SPOT_ID = "steering-console";

/** The hazard spot of a course event, taken from the steering console's place on the map. */
export function courseSpot(console: Station): HazardSpot {
  return { id: COURSE_SPOT_ID, car: console.car, position: { x: console.position.x, y: console.position.y } };
}

/** How many course events are due after `time` seconds of a run. */
export function courseEventsDueBy(time: number, interval: number = COURSE_INTERVAL_SECONDS): number {
  if (!Number.isFinite(time) || !Number.isFinite(interval) || interval <= 0 || time <= 0) return 0;
  // The small margin absorbs the rounding of adding up many fixed ticks.
  return Math.floor((time + 1e-9) / interval);
}

/**
 * Starts a course event when the run clock has just passed a multiple of the interval.
 * `state.time` must already include this step's `dt`, which is how the session calls its
 * systems. If an event is still running, the new one is skipped.
 */
export function stepCourseTrigger(
  state: GameState,
  dt: number,
  console: Station,
  interval: number = COURSE_INTERVAL_SECONDS,
): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return state;
  if (courseEventsDueBy(state.time, interval) <= courseEventsDueBy(state.time - dt, interval)) return state;
  return startCourse(state, courseSpot(console));
}

/** The trigger as a rule system for the game session. Put it before the course rule system. */
export const courseTriggerSystem =
  (console: Station, interval: number = COURSE_INTERVAL_SECONDS): StepSystem =>
  (state, dt) =>
    stepCourseTrigger(state, dt, console, interval);
