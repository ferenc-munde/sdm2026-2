import { INTERACT_RANGE } from "../constants.ts";
import { stepBreaches } from "../hazards/breach.ts";
import type { Interactions } from "../hazards/interactions.ts";
import { pickUpOrDrop } from "../items/items.ts";
import type { GameState, Hazard, Item, Player, Vec2 } from "../types.ts";
import { useCoalStation } from "./coal.ts";

/** Supply these positions from #148's platform map; do not duplicate map coordinates. */
export interface PlatformObjectLayout {
  departureLever: Vec2;
  coalPile: Vec2;
  boiler: Vec2;
  wrench: Vec2;
  breach: Vec2;
  boards: readonly Vec2[];
}

/** Practice-only data. Deliberately has no real journey or director reference. */
export interface PlatformPractice {
  items: Record<string, Item>;
  breach: Hazard | null;
  boilerFuel: number;
  respawnIn: number | null;
}

const practiceBreach = (layout: PlatformObjectLayout): Hazard => ({
  id: "practice-breach", kind: "breach", car: 0, spotId: "practice-breach",
  position: { ...layout.breach }, age: 0, progress: 0, countdown: null,
});

export function createPlatformPractice(layout: PlatformObjectLayout): PlatformPractice {
  return {
    items: { "practice-wrench": {
      id: "practice-wrench", kind: "wrench", position: { ...layout.wrench },
      heldBy: null, velocity: { x: 0, y: 0 },
    } },
    breach: practiceBreach(layout), boilerFuel: 0, respawnIn: null,
  };
}

const inReach = (player: Player | undefined, point: Vec2): boolean =>
  !!player?.connected && Math.hypot(player.position.x - point.x, player.position.y - point.y) <= INTERACT_RANGE;

/** Reuse the tested coal/carry/repair rules against an isolated practice world. */
function practiceWorld(lobby: GameState, practice: PlatformPractice, layout: PlatformObjectLayout): GameState {
  const items = Object.fromEntries(Object.entries(practice.items).map(([id, item]) => {
    if (item.heldBy !== null && !lobby.players[item.heldBy]?.connected) {
      return [id, { ...item, heldBy: null, position: { ...(item.kind === "wrench" ? layout.wrench : layout.coalPile) } }];
    }
    return [id, item];
  }));
  const players = Object.fromEntries(Object.entries(lobby.players).map(([id, player]) => [id, {
    ...player, heldItem: Object.values(items).find(item => item.heldBy === id)?.id ?? null,
  }]));
  return {
    ...lobby, phase: "playing", time: 0, players, items,
    hazards: practice.breach ? { [practice.breach.id]: practice.breach } : {},
    journey: { fuel: practice.boilerFuel, hull: 100, distance: 0, speedFactor: 0 },
  };
}

export function usePracticeObject(
  lobby: GameState, practice: PlatformPractice, playerId: string, layout: PlatformObjectLayout,
): PlatformPractice {
  if (lobby.phase !== "lobby" || !lobby.players[playerId]?.connected) return practice;
  let world = practiceWorld(lobby, practice, layout);
  const stations = [
    { kind: "coalDispenser" as const, car: 0, position: layout.coalPile },
    { kind: "engine" as const, car: 0, position: layout.boiler },
  ].filter(station => inReach(world.players[playerId], station.position));
  stations.sort((a, b) => {
    const p = world.players[playerId]!.position;
    return Math.hypot(p.x - a.position.x, p.y - a.position.y) - Math.hypot(p.x - b.position.x, p.y - b.position.y);
  });
  const station = stations[0];
  const used = station ? useCoalStation(world, playerId, station) : world;
  world = used !== world ? used : pickUpOrDrop(world, playerId);
  return { ...practice, items: world.items, boilerFuel: world.journey.fuel };
}

export function stepPlatformPractice(
  lobby: GameState, practice: PlatformPractice, inputs: Interactions, dt: number, layout: PlatformObjectLayout,
): PlatformPractice {
  if (lobby.phase !== "lobby" || !Number.isFinite(dt) || dt <= 0) return practice;
  if (practice.breach === null) {
    const remaining = Math.max(0, (practice.respawnIn ?? 5) - dt);
    const world = practiceWorld(lobby, practice, layout);
    return { ...practice, items: world.items, respawnIn: remaining > 1e-9 ? remaining : null,
      breach: remaining > 1e-9 ? null : practiceBreach(layout) };
  }
  const world = stepBreaches(practiceWorld(lobby, practice, layout), inputs, dt);
  const breach = world.hazards["practice-breach"] ?? null;
  return { ...practice, items: world.items, breach, respawnIn: breach ? null : 5 };
}

/** Rendering projection: use lobby positions and practice ownership, keeping the real journey. */
export function platformPracticeView(lobby: GameState, practice: PlatformPractice, layout: PlatformObjectLayout): GameState {
  const world = practiceWorld(lobby, practice, layout);
  return { ...lobby, players: world.players, items: world.items, hazards: world.hazards };
}

export type DepartureResult<T> = { ok: true; session: T } | { ok: false; session: T; message: string };
export interface DepartureRules<T> {
  /** Connect the authoritative #148 canDepart rule. */
  canDepart: (session: T, playerId: string) => boolean;
  /** Connect the #148 start rule; it owns train spawn/reset and can still reject. */
  start: (session: T, playerId: string) => DepartureResult<T>;
}

export function useDepartureLever<T>(
  session: T, lobby: GameState, hostId: string | null, playerId: string,
  layout: PlatformObjectLayout, rules: DepartureRules<T>,
): DepartureResult<T> {
  if (lobby.phase !== "lobby" || !inReach(lobby.players[playerId], layout.departureLever)) {
    return { ok: false, session, message: "Walk to the departure lever" };
  }
  if (playerId !== hostId) return { ok: false, session, message: "Only the host can depart" };
  if (!rules.canDepart(session, playerId)) return { ok: false, session, message: "Waiting for the crew" };
  return rules.start(session, playerId);
}

export const PLATFORM_GUIDE = [
  "Work together to reach the station before the hull reaches zero.",
  "Move: WASD or arrow keys. Hold interact: Space or E. Use the action control to pick up or drop items.",
  "Take coal to the engine to add 35 fuel. Hold a wrench at a breach for 3 seconds to repair it.",
  "Hold an extinguisher at a fire for 2.5 seconds. An engine fire stops the train.",
  "Hold the steering console during the final two seconds of a course warning.",
  "Practise here while waiting. Only the host can depart when the crew is complete.",
] as const;

export function isNearPlatformBoard(lobby: GameState, playerId: string, layout: PlatformObjectLayout): boolean {
  return lobby.phase === "lobby" && layout.boards.some(board => inReach(lobby.players[playerId], board));
}

/** True when the connected lobby player can operate the departure lever. */
export function isNearDepartureLever(lobby: GameState, playerId: string, layout: PlatformObjectLayout): boolean {
  return lobby.phase === "lobby" && inReach(lobby.players[playerId], layout.departureLever);
}

/** True near an object handled by the practice action (coal, boiler or wrench). */
export function isNearPracticeObject(lobby: GameState, playerId: string, layout: PlatformObjectLayout): boolean {
  return lobby.phase === "lobby" && [layout.coalPile, layout.boiler, layout.wrench]
    .some(point => inReach(lobby.players[playerId], point));
}
