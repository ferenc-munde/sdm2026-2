import { FIRE_EXTINGUISH_SECONDS } from "../constants.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState } from "../types.ts";
import { canRepair, type Interactions } from "./interactions.ts";
import { isEngineOnFire, speedFactorFor } from "../journey/journey.ts";

/** The train's speed for this state: the journey's rule (fuel level, engine fire), so both always agree. */
export function speedFactorForHazards(state: GameState): number {
  return speedFactorFor(state.journey.fuel, isEngineOnFire(state.hazards));
}

/** Extinguishing only; journeySystem owns continuous fire damage. */
export function stepFires(state: GameState, inputs: Interactions, dt: number): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return state;
  const hazards = { ...state.hazards };
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.kind !== "fire") continue;
    const duration = FIRE_EXTINGUISH_SECONDS;
    const repairing = canRepair(state, hazard, inputs, "extinguisher");
    const progress = repairing ? hazard.progress + dt / duration : 0;
    if (progress >= 1 - 1e-9) delete hazards[hazard.id];
    else hazards[hazard.id] = { ...hazard, age: hazard.age + dt, progress };
  }
  const next = { ...state, hazards, journey: { ...state.journey, speedFactor: state.journey.speedFactor } };
  next.journey.speedFactor = speedFactorForHazards(next);
  return next;
}

/** Run after journeySystem; the final extinguishing tick damages once. */
export const fireSystem: StepSystem = (state, dt, frame) =>
  stepFires(state, Object.fromEntries(Object.entries(frame.inputs).map(([id, input]) => [id, input.interacting])), dt);
