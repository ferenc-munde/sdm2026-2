import { COURSE_WARNING_SECONDS, COURSE_HOLD_WINDOW_SECONDS, COURSE_HULL_DAMAGE, INTERACT_RANGE } from "../constants.ts";
import type { GameState, Station } from "../types.ts";
import type { HazardSpot } from "../run/director.ts";
import type { StepSystem } from "../run/session.ts";
import type { Interactions } from "./interactions.ts";
import { isStationDisabledByFire } from "./fire.ts";

/** The room/director calls this when a course event is due. */
export function startCourse(state: GameState, spot: HazardSpot): GameState {
  if (state.phase !== "playing" || Object.values(state.hazards).some(h => h.kind === "course" || h.spotId === spot.id)) return state;
  let serial = 1;
  while (state.hazards[`course-${serial}`]) serial++;
  const id = `course-${serial}`;
  return { ...state, hazards: { ...state.hazards, [id]: {
    id, kind: "course", car: spot.car, spotId: spot.id, position: { ...spot.position },
    age: 0, progress: 0, countdown: COURSE_WARNING_SECONDS,
  } } };
}

/** Hold the console continuously throughout the final two seconds. No tool is required. */
export function stepCourses(state: GameState, inputs: Interactions, dt: number, console: Station): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0 || console.kind !== "steeringConsole") return state;
  const steering = !isStationDisabledByFire(state, console) && Object.values(state.players).some(p => p.connected && inputs[p.id] === true &&
    Math.hypot(p.position.x - console.position.x, p.position.y - console.position.y) <= INTERACT_RANGE);
  const hazards = { ...state.hazards };
  let damage = 0;
  for (const h of Object.values(state.hazards)) {
    if (h.kind !== "course" || h.countdown === null) continue;
    const remaining = Math.max(0, h.countdown - dt);
    const overlap = Math.max(0, Math.min(h.countdown, COURSE_HOLD_WINDOW_SECONDS) - remaining);
    const progress = steering ? h.progress + overlap / COURSE_HOLD_WINDOW_SECONDS : 0;
    if (remaining === 0) {
      if (progress < 1 - 1e-9) damage += COURSE_HULL_DAMAGE;
      delete hazards[h.id];
    } else hazards[h.id] = { ...h, countdown: remaining, progress, age: h.age + dt };
  }
  return { ...state, hazards, journey: { ...state.journey, hull: Math.max(0, state.journey.hull - damage) } };
}

export const courseSystem = (console: Station): StepSystem => (state, dt, frame) =>
  stepCourses(state, Object.fromEntries(Object.entries(frame.inputs).map(([id, input]) => [id, input.interacting])), dt, console);
