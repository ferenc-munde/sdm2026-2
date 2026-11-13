import { INTERACT_RANGE } from "../constants.ts";
import type { GameState, Hazard, ItemKind } from "../types.ts";

/** Server-maintained held-interact inputs, never a client-supplied progress value. */
export type Interactions = Readonly<Record<string, boolean>>;

export function canRepair(state: GameState, hazard: Hazard, inputs: Interactions, tool: ItemKind): boolean {
  return Object.values(state.players).some(player => {
    const item = player.heldItem === null ? undefined : state.items[player.heldItem];
    return player.connected && inputs[player.id] === true && item?.kind === tool &&
      item.heldBy === player.id && Math.hypot(
        player.position.x - hazard.position.x, player.position.y - hazard.position.y,
      ) <= INTERACT_RANGE;
  });
}

