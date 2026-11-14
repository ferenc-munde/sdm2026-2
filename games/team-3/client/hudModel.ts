// Turns the server's journey numbers into what the heads-up display shows (#20).
//
// Pure functions with no DOM: the widths and colours of the three bars are
// computed here and tested, and `hud.ts` only writes them into the page.
//
// The server owns `journey` in `GameState` (shared/types.ts) and patches it ~20
// times a second; the HUD renders whatever `journey` it is handed.

import { FUEL_MAX, HULL_MAX, LOW_FUEL_THRESHOLD, WIN_DISTANCE } from "../shared/constants.ts";
import type { Journey } from "../shared/types.ts";

/** Clamps `value` into `0..max` and returns the share of the bar to fill. */
export function barFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Hull as a 0..1 share of the hull bar. */
export function hullFraction(journey: Pick<Journey, "hull">): number {
  return barFraction(journey.hull, HULL_MAX);
}

/** Fuel as a 0..1 share of the fuel bar. */
export function fuelFraction(journey: Pick<Journey, "fuel">): number {
  return barFraction(journey.fuel, FUEL_MAX);
}

/** Distance covered as a 0..1 share of the journey bar. */
export function journeyFraction(journey: Pick<Journey, "distance">): number {
  return barFraction(journey.distance, WIN_DISTANCE);
}

/** The fuel bar turns orange at or below the low-fuel threshold, where the train slows down. */
export function fuelIsLow(journey: Pick<Journey, "fuel">): boolean {
  return journey.fuel <= LOW_FUEL_THRESHOLD;
}

/** CSS colours of a bar. */
export const BAR_COLORS = {
  hull: "#e5484d",
  fuel: "#30a46c",
  fuelLow: "#f76b15",
  distance: "#3e63dd",
} as const;

/** Everything the HUD needs for one tick, ready to write into the page. */
export interface HudView {
  hull: number;
  fuel: number;
  distance: number;
  hullWidth: number;
  fuelWidth: number;
  distanceWidth: number;
  fuelColor: string;
  /** "620 / 1800" for screen readers and tests. */
  distanceText: string;
  lowFuel: boolean;
}

/** Whole numbers, as shown to players. */
function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

/** Builds the view of the three bars from the server state. */
export function hudView(journey: Journey): HudView {
  const lowFuel = fuelIsLow(journey);
  return {
    hull: round(journey.hull),
    fuel: round(journey.fuel),
    distance: round(journey.distance),
    hullWidth: hullFraction(journey),
    fuelWidth: fuelFraction(journey),
    distanceWidth: journeyFraction(journey),
    fuelColor: lowFuel ? BAR_COLORS.fuelLow : BAR_COLORS.fuel,
    distanceText: `${round(journey.distance)} / ${WIN_DISTANCE}`,
    lowFuel,
  };
}
