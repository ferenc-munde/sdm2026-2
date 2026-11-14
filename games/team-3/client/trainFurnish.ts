// Passenger-car furnishing (#437): benches against the far wall, overhead luggage racks and a
// few cases. Decoration only — nothing here has collision, so players walk through it, and the
// layout is computed by a pure function so a test can prove it never sits on a station or a
// hazard spot. The near side stays empty so the cutaway and the camera are unchanged.
//
// Positions are relative to the car centre: `dz` is negative towards the far wall (the wall's
// inner face is at about -110), and the benches stand just in front of it.

import type { TrainMap } from "../shared/map/map.ts";
import type { Vec2 } from "../shared/types.ts";

/** Distance kept between a decoration and any station or hazard spot. */
export const FURNISHING_CLEARANCE = 60;
/** The far wall's inner face, relative to the car centre. */
export const FAR_INNER = -110;
/** Benches sit this far in front of the far wall. */
export const BENCH_DEPTH = 5;
const BENCH_COUNT = 4;

export interface FurnishingSpot {
  /** Along the car (0 is the car centre, positive is towards the rear). */
  dx: number;
  /** Across the car (negative is towards the far wall). */
  dz: number;
  kind: "bench" | "suitcase";
}

/**
 * Where the benches and cases go: evenly spaced, skipping any spot too close to a station or a
 * hazard spot. Cases are small, so they are only checked against the clearance they really need.
 */
export function furnishingLayout(
  car: TrainMap["cars"][number],
  spots: readonly Vec2[],
  clearance = FURNISHING_CLEARANCE,
): FurnishingSpot[] {
  const out: FurnishingSpot[] = [];
  // Benches are 64 wide: keep their ends inside the car (car.width / 2 - 40).
  // Benches are 64 wide with 40-unit end margins: centre them evenly inside that span.
  const margin = 40;
  const firstCentre = -car.width / 2 + margin + 32;
  const lastCentre = car.width / 2 - margin - 32;
  const perBench = (lastCentre - firstCentre) / (BENCH_COUNT - 1);
  const benchDz = FAR_INNER + BENCH_DEPTH;
  const near = (at: Vec2, needed: number): boolean =>
    spots.some((spot) => Math.hypot(spot.x - at.x, spot.y - at.y) < needed);
  const benches: number[] = [];
  for (let i = 0; i < BENCH_COUNT; i += 1) {
    const dx = firstCentre + i * perBench;
    // A bench is wide: only give way when the interaction point is near its own footprint.
    if (near({ x: car.x + dx, y: car.y + benchDz }, clearance)) continue;
    out.push({ dx, dz: benchDz, kind: "bench" });
    benches.push(dx);
  }
  // A case beside every other bench, checked on its own.
  benches.forEach((dx, i) => {
    if (i % 2 !== 0) return;
    const caseDx = dx + 32;
    if (near({ x: car.x + caseDx, y: car.y + benchDz }, clearance)) return;
    out.push({ dx: caseDx, dz: benchDz, kind: "suitcase" });
  });
  return out;
}
