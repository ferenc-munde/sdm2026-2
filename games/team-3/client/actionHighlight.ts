// Which object the action key would use, turned into a place to draw a ring (#295).
//
// The rules half lives in `shared/items/actionTarget.ts` and matches the room exactly; this file is
// only the client mapping from that target to a position and a colour. Drawing the ring is the
// scenes' job, so this stays pure and testable.

import { actionTarget, type ActionTarget } from "../shared/items/actionTarget.ts";
import { canDepart } from "../shared/run/lobby.ts";
import type { TrainMap } from "../shared/map/map.ts";
import type { PlatformMap } from "../shared/map/platform.ts";
import type { GameState, PlayerId, Vec2 } from "../shared/types.ts";

export type HighlightTone = "station" | "item" | "lever" | "drop";

/** Where to put the ring and which colour it takes. */
export interface ActionHighlight {
  position: Vec2;
  tone: HighlightTone;
}

/** One distinct ring colour per kind of action, bright enough on the dark floor. */
export const HIGHLIGHT_COLORS: Readonly<Record<HighlightTone, string>> = {
  station: "#f5d90a",
  item: "#4cc9f0",
  lever: "#30a46c",
  drop: "#e5484d",
};

/**
 * The ring for a target. Stations, items and the lever sit where they are; dropping happens at the
 * player's feet, so that one needs the player's position.
 */
export function actionHighlight(target: ActionTarget, playerPosition: Vec2): ActionHighlight | null {
  if (!target) return null;
  switch (target.kind) {
    case "takeCoal":
    case "deliverCoal":
      return { position: { ...target.station.position }, tone: "station" };
    case "pickUp":
      return { position: { ...target.position }, tone: "item" };
    case "lever":
      return { position: { ...target.position }, tone: "lever" };
    case "drop":
      return { position: { ...playerPosition }, tone: "drop" };
  }
}

/**
 * The local player's highlight for this frame. The rules return the lever whenever it is in reach,
 * even for a player who may not depart; the room then refuses the action, so the client does not
 * promise it — no ring unless this player could actually pull it.
 */
export function localActionHighlight(
  state: GameState,
  playerId: PlayerId,
  world: { train: TrainMap; platform?: PlatformMap },
): ActionHighlight | null {
  const player = state.players[playerId];
  if (!player) return null;
  const target = actionTarget(state, playerId, world);
  if (target?.kind === "lever" && !canDepart(state, playerId)) return null;
  return actionHighlight(target, player.position);
}
