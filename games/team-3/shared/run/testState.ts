// Builders for tests of the run rules.

import { FUEL_START, HULL_START, SPEED_FACTOR_FULL } from "../constants.ts";
import type { GameState, Item, ItemKind, Player } from "../types.ts";

export function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    facing: { dx: 1, dy: 0 },
    heldItem: null,
    connected: true,
    ...overrides,
  };
}

export function makeItem(id: string, kind: ItemKind, overrides: Partial<Item> = {}): Item {
  return { id, kind, position: { x: 0, y: 0 }, heldBy: null, velocity: { x: 0, y: 0 }, ...overrides };
}

export function makeState(overrides: Partial<GameState> = {}, playerIds: string[] = ["p1", "p2"]): GameState {
  const players: GameState["players"] = {};
  for (const id of playerIds) players[id] = makePlayer(id);
  return {
    roomCode: "TEST",
    phase: "playing",
    time: 0,
    players,
    items: {},
    hazards: {},
    journey: { fuel: FUEL_START, hull: HULL_START, distance: 0, speedFactor: SPEED_FACTOR_FULL },
    ...overrides,
  };
}
