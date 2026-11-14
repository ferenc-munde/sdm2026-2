import { COAL_FUEL, FUEL_MAX, INTERACT_RANGE } from "../constants.ts";
import type { GameState, Station } from "../types.ts";
import { isStationDisabledByFire } from "../hazards/fire.ts";

/** Call once per station-use input, after selecting the target station. */
export function useCoalStation(state: GameState, playerId: string, station: Station): GameState {
  const player = state.players[playerId];
  if (state.phase !== "playing" || !player?.connected ||
      Math.hypot(player.position.x - station.position.x, player.position.y - station.position.y) > INTERACT_RANGE ||
      isStationDisabledByFire(state, station)) return state;

  if (station.kind === "coalDispenser" && player.heldItem === null) {
    let serial = 1;
    while (state.items[`coal-${serial}`]) serial++;
    const id = `coal-${serial}`;
    return {
      ...state,
      players: { ...state.players, [playerId]: { ...player, heldItem: id } },
      items: { ...state.items, [id]: {
        id, kind: "coal", heldBy: playerId,
        position: { ...player.position }, velocity: { x: 0, y: 0 },
      } },
    };
  }

  const item = player.heldItem === null ? undefined : state.items[player.heldItem];
  if (station.kind !== "engine" || item?.kind !== "coal" || item.heldBy !== playerId) return state;
  const items = { ...state.items };
  delete items[item.id];
  return {
    ...state, items,
    players: { ...state.players, [playerId]: { ...player, heldItem: null } },
    journey: { ...state.journey, fuel: Math.min(FUEL_MAX, state.journey.fuel + COAL_FUEL) },
  };
}
