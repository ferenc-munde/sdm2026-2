// Smooth movement between room updates (additional improvement, Developer 2).
//
// The room sends the state 20 times a second, but the screen draws ~60 times a second. Drawing
// the raw positions makes players and items step and snap. Each frame, every drawn position now
// eases toward its latest server position; a big jump (boarding the train, play again, a
// reconnect) snaps instead of sliding across the map. The server stays the only authority.

import type { Vec2 } from "../shared/types.ts";

/** How fast a drawn position catches up, per second: about 90% of the gap in 0.1 s. */
export const SMOOTHING_RATE = 22;
/** Farther than this from the server position, jump straight there instead of sliding. */
export const SNAP_DISTANCE = 120;

export interface Smoother {
  /** Eases each id toward its target by `dt` seconds and returns the positions to draw. */
  step(targets: Readonly<Record<string, Vec2>>, dt: number): Record<string, Vec2>;
}

export function createSmoother(rate = SMOOTHING_RATE, snapDistance = SNAP_DISTANCE): Smoother {
  let drawn: Record<string, Vec2> = {};
  return {
    step(targets, dt) {
      const blend = dt > 0 && Number.isFinite(dt) ? 1 - Math.exp(-rate * dt) : 0;
      const next: Record<string, Vec2> = {};
      for (const [id, target] of Object.entries(targets)) {
        const from = drawn[id];
        if (!from || Math.hypot(target.x - from.x, target.y - from.y) > snapDistance) {
          next[id] = { x: target.x, y: target.y };
        } else {
          next[id] = { x: from.x + (target.x - from.x) * blend, y: from.y + (target.y - from.y) * blend };
        }
      }
      drawn = next; // ids that left the state are forgotten
      return next;
    },
  };
}

/** The same records with each entry's `position` replaced by the smoothed one. */
export function withPositions<T extends { position: Vec2 }>(
  records: Readonly<Record<string, T>>,
  positions: Readonly<Record<string, Vec2>>,
): T[] {
  return Object.entries(records).map(([id, record]) => ({ ...record, position: positions[id] ?? record.position }));
}
