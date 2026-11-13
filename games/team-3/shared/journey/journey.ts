// The journey model: fuel drains, the train's speed depends on fuel, the distance grows
// with the speed, and the hull wears down while hazards burn. All numbers are from
// PLAN.md section 3 (see ../constants.ts).
//
// Winning and losing are not decided here: the session runs evaluateOutcome() from
// ../run/phases.ts after every step, which ends the run at WIN_DISTANCE or at 0 hull.
// Pure and deterministic, like every rule in shared/.

import {
  FUEL_DRAIN_PER_SECOND,
  HULL_LOSS_PER_BREACH_PER_SECOND,
  HULL_LOSS_PER_FIRE_PER_SECOND,
  LOW_FUEL_THRESHOLD,
  SPEED_FACTOR_FULL,
  SPEED_FACTOR_LOW,
  SPEED_FACTOR_STOPPED,
  TRAIN_FULL_SPEED,
  WIN_DISTANCE,
} from "../constants.ts";
import { ENGINE_SPOT_ID } from "../map/map.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState, Hazard } from "../types.ts";

/** True while a fire burns on the engine. An engine fire stalls the train. */
export function isEngineOnFire(hazards: GameState["hazards"]): boolean {
  return Object.values(hazards).some((hazard) => hazard.kind === "fire" && hazard.spotId === ENGINE_SPOT_ID);
}

/**
 * How fast the train runs, as a share of full speed:
 * 1.0 above 25 fuel, 0.5 at 25 or below, 0 when the tank is empty or the engine is on fire.
 */
export function speedFactorFor(fuel: number, engineOnFire: boolean): number {
  if (engineOnFire || fuel <= 0) return SPEED_FACTOR_STOPPED;
  if (fuel <= LOW_FUEL_THRESHOLD) return SPEED_FACTOR_LOW;
  return SPEED_FACTOR_FULL;
}

/** How much hull one hazard takes per second. The course hazard (#28) hits once instead. */
export function hullLossPerSecondOf(hazard: Hazard): number {
  if (hazard.kind === "breach") return HULL_LOSS_PER_BREACH_PER_SECOND;
  if (hazard.kind === "fire") return HULL_LOSS_PER_FIRE_PER_SECOND;
  return 0;
}

/** Hull lost per second from every active hazard together. */
export function hullLossPerSecond(hazards: GameState["hazards"]): number {
  return Object.values(hazards).reduce((total, hazard) => total + hullLossPerSecondOf(hazard), 0);
}

/**
 * Advances the journey by `dt` seconds while the run is being played:
 * 1. fuel drains by 1.8 per second, never below 0;
 * 2. the speed factor follows the new fuel level and any engine fire;
 * 3. the distance grows by full speed times the speed factor, up to WIN_DISTANCE;
 * 4. the hull drops by the loss of every active hazard, never below 0.
 * Outside the "playing" phase nothing changes. Returns a new state.
 */
export function stepJourney(state: GameState, dt: number): GameState {
  if (state.phase !== "playing" || dt <= 0) return state;
  const { journey } = state;

  const fuel = Math.max(0, journey.fuel - FUEL_DRAIN_PER_SECOND * dt);
  const speedFactor = speedFactorFor(fuel, isEngineOnFire(state.hazards));
  const distance = Math.min(WIN_DISTANCE, journey.distance + TRAIN_FULL_SPEED * speedFactor * dt);
  const hull = Math.max(0, journey.hull - hullLossPerSecond(state.hazards) * dt);

  return { ...state, journey: { fuel, speedFactor, distance, hull } };
}

/** The journey as a rule system for the game session (#82). */
export const journeySystem: StepSystem = (state, dt) => stepJourney(state, dt);
