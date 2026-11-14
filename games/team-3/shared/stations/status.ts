import { INTERACT_RANGE } from "../constants.ts";
import { isStationDisabledByFire } from "../hazards/fire.ts";
import { createTrainMap, type TrainMap } from "../map/map.ts";
import type { GameState, StationKind } from "../types.ts";

export type StationStatus = "usable" | "disabledByFire" | "inUse";
export type StationStatuses = Record<StationKind, StationStatus>;

/** Pure player-facing status for every station on the train. */
export function stationStatus(state: GameState, map: TrainMap = createTrainMap()): StationStatuses {
  return Object.fromEntries(map.stations.map((station) => {
    if (isStationDisabledByFire(state, station)) return [station.kind, "disabledByFire"];
    const inUse = Object.values(state.players).some((player) => player.connected &&
      Math.hypot(player.position.x - station.position.x, player.position.y - station.position.y) <= INTERACT_RANGE);
    return [station.kind, inUse ? "inUse" : "usable"];
  })) as StationStatuses;
}
