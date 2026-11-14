// What tapping the action key (E) would do right now (#295), so the client can highlight it
// for the local player before they press. It follows the server's own order exactly
// (useRunAction in run/room.ts, the lever check in run/boarding.ts), and a test runs both side
// by side, so the highlight can't disagree with what the room then does. Pure.

import { INTERACT_RANGE } from "../constants.ts";
import type { TrainMap } from "../map/map.ts";
import type { PlatformMap } from "../map/platform.ts";
import { isStationDisabledByFire } from "../hazards/fire.ts";
import { isNearDepartureLever } from "../stations/platform.ts";
import type { GameState, ItemId, PlayerId, Station, Vec2 } from "../types.ts";
import { nearestFreeItem } from "./items.ts";

export type ActionTarget =
  | { kind: "takeCoal" | "deliverCoal"; station: Station }
  | { kind: "pickUp"; itemId: ItemId; position: Vec2 }
  | { kind: "drop"; itemId: ItemId }
  | { kind: "lever"; position: Vec2 }
  | null;

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * What tap-E would act on for `playerId`, or null if nothing. In a run: the nearest coal
 * station in reach if it would work (take coal with empty hands, deliver held coal at the
 * engine), otherwise drop what is held, otherwise the nearest free item. On the platform:
 * the departure lever when in reach (practice objects keep their own state, see #153).
 */
export function actionTarget(
  state: GameState,
  playerId: PlayerId,
  world: { train: TrainMap; platform?: PlatformMap },
): ActionTarget {
  const player = state.players[playerId];
  if (!player?.connected) return null;

  if (state.phase === "lobby") {
    return world.platform && isNearDepartureLever(state, playerId, world.platform.objects)
      ? { kind: "lever", position: { ...world.platform.objects.departureLever } }
      : null;
  }
  if (state.phase !== "playing") return null;

  const held = player.heldItem === null ? undefined : state.items[player.heldItem];
  const station = world.train.stations
    .filter((s) => (s.kind === "coalDispenser" || s.kind === "engine") && distance(s.position, player.position) <= INTERACT_RANGE)
    .sort((a, b) => distance(a.position, player.position) - distance(b.position, player.position))[0];
  // A fire next to a station disables it (#226); the room then falls through to pick up / drop.
  const usable = station && !isStationDisabledByFire(state, station) ? station : undefined;
  if (usable?.kind === "coalDispenser" && player.heldItem === null) return { kind: "takeCoal", station: usable };
  if (usable?.kind === "engine" && held?.kind === "coal" && held.heldBy === playerId) return { kind: "deliverCoal", station: usable };

  if (player.heldItem !== null) return { kind: "drop", itemId: player.heldItem };
  const item = nearestFreeItem(state, player.position);
  return item ? { kind: "pickUp", itemId: item.id, position: { ...item.position } } : null;
}
