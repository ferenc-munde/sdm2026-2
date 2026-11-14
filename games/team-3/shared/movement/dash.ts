// Dash (#228): with empty hands, Shift or F gives a short burst of speed in the direction the
// player faces, to cross a gap or get to a hazard quickly. It stops at walls like walking,
// without the course knockback's wall stun, and has a cooldown. Holding an item, the same key
// throws it instead (throw.ts). Pure and deterministic.

import { DASH_COOLDOWN_SECONDS, DASH_SECONDS, DASH_SPEED } from "../constants.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState, Player, PlayerId } from "../types.ts";
import { isStill, movePosition, type Walled } from "./movement.ts";

const isKnockedBack = (p: Player): boolean => !!p.velocity && (p.velocity.x !== 0 || p.velocity.y !== 0);

/** True when the player may start a dash now. */
export function canDash(state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  return (
    state.phase === "playing" &&
    !!p?.connected &&
    p.heldItem === null &&
    (p.stunnedSeconds ?? 0) <= 0 &&
    !isKnockedBack(p) &&
    (p.dashSeconds ?? 0) <= 0 &&
    (p.dashCooldown ?? 0) <= 0 &&
    !isStill(p.facing)
  );
}

/** Starts a dash in the facing direction, if the player may dash; otherwise returns the state unchanged. */
export function startDash(state: GameState, playerId: PlayerId): GameState {
  if (!canDash(state, playerId)) return state;
  const p = state.players[playerId]!;
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...p, dashSeconds: DASH_SECONDS, dashCooldown: DASH_COOLDOWN_SECONDS } },
  };
}

/** Moves dashing players and counts every cooldown down by `dt` seconds. Run it after movement. */
export function stepDashes(state: GameState, dt: number, map: Walled): GameState {
  if (state.phase !== "playing" || dt <= 0) return state;
  let players: GameState["players"] | null = null;
  for (const [id, p] of Object.entries(state.players)) {
    const dashing = p.dashSeconds ?? 0;
    const cooldown = p.dashCooldown ?? 0;
    if (dashing <= 0 && cooldown <= 0) continue;
    // A stun or a knockback cuts the dash short.
    const interrupted = (p.stunnedSeconds ?? 0) > 0 || isKnockedBack(p);
    const time = interrupted ? 0 : Math.min(dt, dashing);
    players ??= { ...state.players };
    players[id] = {
      ...p,
      position: time > 0 ? movePosition(map, p.position, p.facing, time, DASH_SPEED) : p.position,
      dashSeconds: interrupted ? 0 : Math.max(0, dashing - dt),
      dashCooldown: Math.max(0, cooldown - dt),
    };
  }
  return players ? { ...state, players } : state;
}

/** Dashing as a rule system for the run; list it right after movement. */
export function createDashSystem(map: Walled): StepSystem {
  return (state, dt) => stepDashes(state, dt, map);
}
