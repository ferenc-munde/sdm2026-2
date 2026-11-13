// The Last Train as a platform game (#80): the `GameDefinition` that `@sdm/host` runs as a room.
//
// All the rules live in the room pipeline (run/room.ts, #198); this file only adapts it to the
// platform's room base. The synced state extends `BaseState` and carries the game state every
// browser draws as one JSON string (`view`), plus the last refusal per player (`notices`).
// Browser-safe like the rest of shared/: only @colyseus/schema, zod and @sdm/core/sim.

import { type } from "@colyseus/schema";
import { BaseState, RoomSettingsSchema, type GameContext, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import { z } from "zod";
import { GAME_ID } from "./index.ts";
import type { ErrorCode } from "./messages.ts";
import {
  createRoom,
  createRoomWorld,
  disconnectFromRoom,
  handleMessage,
  joinRoom,
  leaveRoom,
  parseClientMessage,
  roomView,
  stepRoom,
  type Room,
  type RoomWorld,
} from "./run/room.ts";
import type { GameState, PlayerId } from "./types.ts";

/** Why the room refused a player's last message. `n` counts up, so the same error twice is still news. */
export interface Notice {
  error: ErrorCode;
  message?: string;
  n: number;
}

/** The state the platform syncs to every browser. */
export class LastTrainState extends BaseState {
  /** The game state to draw, as JSON: `roomView` (the platform in the lobby, the train in a run). */
  @type("string") view = "";
  /** The last refusal per player, as JSON: `Record<PlayerId, Notice>`. */
  @type("string") notices = "{}";
}

/** Reads the game state out of a synced `LastTrainState`, or null before the first tick. */
export function readView(state: Pick<LastTrainState, "view">): GameState | null {
  return state.view ? (JSON.parse(state.view) as GameState) : null;
}

/** Reads one player's last refusal out of a synced `LastTrainState`. */
export function readNotice(state: Pick<LastTrainState, "notices">, playerId: PlayerId): Notice | null {
  const notices = JSON.parse(state.notices || "{}") as Record<PlayerId, Notice>;
  return notices[playerId] ?? null;
}

/** What the room keeps next to the synced state; never sent to clients. */
interface Hidden {
  dt: number;
  room: Room | null;
  notices: Record<PlayerId, Notice>;
}

const world: RoomWorld = createRoomWorld();
const hidden = new WeakMap<LastTrainState, Hidden>();

function hiddenOf(state: LastTrainState): Hidden {
  const entry = hidden.get(state);
  if (!entry?.room) throw new Error("The Last Train room was used before init");
  return entry;
}

function publish(state: LastTrainState, entry: Hidden): void {
  state.view = JSON.stringify(roomView(entry.room!, world));
}

function notify(state: LastTrainState, entry: Hidden, playerId: PlayerId, error: ErrorCode, message?: string): void {
  const n = (entry.notices[playerId]?.n ?? 0) + 1;
  entry.notices = { ...entry.notices, [playerId]: message === undefined ? { error, n } : { error, message, n } };
  state.notices = JSON.stringify(entry.notices);
}

/**
 * Clients send the game's own messages (`shared/messages.ts`) as the platform's input. The first
 * one must be `createRoom` or `joinRoom` with the player's name: the platform's join has no name,
 * so a player only takes a seat in the game when that message arrives. The schema accepts
 * anything so a bad message is refused with a notice instead of the platform closing the
 * connection; `parseClientMessage` checks it in `step`.
 */
const InputSchema = z.unknown();

export const lastTrain: GameDefinition<LastTrainState, RoomSettings, unknown> = {
  id: GAME_ID,
  configSchema: RoomSettingsSchema,
  inputSchema: InputSchema,

  createState(config) {
    const state = new LastTrainState();
    hidden.set(state, { dt: 1 / config.tickRate, room: null, notices: {} });
    return state;
  },

  init(state, ctx: GameContext) {
    const entry = hidden.get(state)!;
    entry.room = createRoom(state.code, ctx.random, world);
    publish(state, entry);
  },

  // The seat is taken by the `createRoom`/`joinRoom` message, which carries the name.
  join() {},

  leave(state, playerId) {
    const entry = hiddenOf(state);
    entry.room = leaveRoom(entry.room!, playerId);
    const { [playerId]: _gone, ...rest } = entry.notices;
    entry.notices = rest;
    state.notices = JSON.stringify(rest);
    publish(state, entry);
  },

  disconnect(state, playerId) {
    const entry = hiddenOf(state);
    entry.room = disconnectFromRoom(entry.room!, playerId);
    publish(state, entry);
  },

  reconnect(state, playerId) {
    const entry = hiddenOf(state);
    const player = entry.room!.lobby.session.state.players[playerId];
    if (!player) return;
    const result = joinRoom(entry.room!, playerId, player.name, world);
    entry.room = result.room;
    publish(state, entry);
  },

  step(state, inputs) {
    const entry = hiddenOf(state);
    for (const { playerId, input } of inputs) {
      const message = parseClientMessage(input);
      if (!message) {
        notify(state, entry, playerId, "invalidMessage");
        continue;
      }
      const result = handleMessage(entry.room!, playerId, message, world);
      entry.room = result.room;
      if (!result.ok) notify(state, entry, playerId, result.error, result.message);
    }
    entry.room = stepRoom(entry.room!, entry.dt, world);
    publish(state, entry);
  },
};
