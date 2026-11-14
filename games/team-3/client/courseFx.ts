// Visual feedback for a failed course event (#219): a camera shake and a brief
// tilt of the train hull. Pure functions so the timing and the size can be tested;
// `main.ts` only writes the numbers into the Three.js camera and hull group.
//
// The rules live in `shared/hazards/course.ts`: when the warning ends without the
// console held, every player is pushed sideways and the hull loses COURSE_HULL_DAMAGE.

import { COURSE_HULL_DAMAGE } from "../shared/constants.ts";
import { courseImpulseDirection } from "../shared/hazards/course.ts";
import type { GameState } from "../shared/types.ts";

/** True when a course hazard ended in failure between two states. */
export function courseFailed(previous: GameState, next: GameState): boolean {
  const before = Object.values(previous.hazards).filter((hazard) => hazard.kind === "course");
  if (before.length === 0) return false;
  const remaining = new Set(Object.keys(next.hazards));
  const ended = before.find((hazard) => !remaining.has(hazard.id));
  if (!ended) return false;
  // A held console also removes the hazard, but only the failure takes hull.
  return previous.journey.hull - next.journey.hull >= COURSE_HULL_DAMAGE - 1e-9;
}

/** The direction of the push for the hazard that just failed, for the tilt sign. */
export function failureDirection(previous: GameState, next: GameState): 1 | -1 {
  const before = Object.values(previous.hazards).filter((hazard) => hazard.kind === "course");
  const remaining = new Set(Object.keys(next.hazards));
  const ended = before.find((hazard) => !remaining.has(hazard.id));
  return ended ? courseImpulseDirection(ended.id) : 1;
}

/** How long the shake and tilt last, in seconds. */
export const COURSE_FX_SECONDS = 0.9;
/** Largest camera offset, in world units. */
export const COURSE_SHAKE_PX = 16;
/** Largest hull tilt, in radians (2.5 degrees). */
export const COURSE_TILT_RADIANS = (2.5 * Math.PI) / 180;

export interface CourseFxView {
  /** Camera offset along x, in world units. */
  shakeX: number;
  /** Camera offset along y, in world units. */
  shakeY: number;
  /** Hull rotation around z, in radians. Positive is one side, negative the other. */
  tilt: number;
}

/** The effect `elapsedSeconds` after the failure; all zero once it is over. */
export function courseFx(elapsedSeconds: number, direction: 1 | -1 = 1): CourseFxView {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= COURSE_FX_SECONDS) {
    return { shakeX: 0, shakeY: 0, tilt: 0 };
  }

  const progress = elapsedSeconds / COURSE_FX_SECONDS; // 0 -> 1
  const decay = 1 - progress;
  const amplitude = COURSE_SHAKE_PX * decay;

  return {
    shakeX: Math.sin(elapsedSeconds * 110) * amplitude,
    shakeY: Math.cos(elapsedSeconds * 80) * amplitude * 0.6,
    // One bump: 0 -> ±max -> 0, so the hull rocks and settles.
    tilt: direction * COURSE_TILT_RADIANS * Math.sin(progress * Math.PI),
  };
}
