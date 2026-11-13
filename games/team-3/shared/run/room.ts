// The room pipeline (#197): everything a room does with the rules, as pure functions, so the
// platform room (#80) only has to call them. `handleMessage` turns each client message into
// the right session event, `stepRoom` advances the lobby or the run by one tick, and
// `roomView` is the state to sync to every browser.
//
// There is no server here: no network, no clock and no Math.random(). The room passes in the
// elapsed time and owns one seeded random source per room.

import { INTERACT_RANGE, PLAYER_NAME_MAX_LENGTH, PLAYER_RADIUS } from "../constants.ts";
import { journeySystem } from "../journey/journey.ts";
import { breachSystem } from "../hazards/breach.ts";
import { courseSystem } from "../hazards/course.ts";
import { fireSystem } from "../hazards/fire.ts";
import { fireSpreadSystem } from "../hazards/spread.ts";
import { pickUpOrDrop } from "../items/items.ts";
import { createThrowSystem, throwItem } from "../items/throw.ts";
import { createTrainMap, type TrainMap } from "../map/map.ts";
import { createPlatformMap, platformSpawn, type PlatformMap } from "../map/platform.ts";
import type { ClientMessage, ErrorCode } from "../messages.ts";
import { stepMovement } from "../movement/movement.ts";
import { useCoalStation } from "../stations/coal.ts";
import type { GameState, PlayerId, Station, Vec2 } from "../types.ts";
import {
  createPlatformLobby,
  departAndBoard,
  platformLobbyView,
  playAgainOnPlatform,
  stepPlatformLobby,
  usePlatformAction,
  type PlatformLobbySession,
} from "./boarding.ts";
import { courseTriggerSystem } from "./courseTrigger.ts";
import { createSeededRandom, type RandomSource } from "./random.ts";
import {
  applyInput,
  configureRoom,
  createSession,
  disconnectFromSession,
  inputDirections,
  joinSession,
  leaveSession,
  stepSession,
  type GameSession,
  type SessionResult,
  type StepSystem,
} from "./session.ts";

/** The fixed maps a room plays on, and the systems built from them. Build once, share by every room. */
export interface RoomWorld {
  train: TrainMap;
  platform: PlatformMap;
  steeringConsole: Station;
  /** The run's rule systems, in the order they must run (see `createRunSystems`). */
  systems: readonly StepSystem[];
}

/** Everything one room keeps: the session with its practice platform, and its random source. */
export interface Room {
  lobby: PlatformLobbySession;
  random: RandomSource;
}

/** The answer to a message: the new room, or why it was refused. `message` is set for platform actions. */
export type RoomResult =
  | { ok: true; room: Room }
  | { ok: false; room: Room; error: ErrorCode; message?: string };

/**
 * The run's rule systems in order. Each one assumes the ones before it already ran this tick:
 * 1. movement: players walk by their held keys
 * 2. thrown items fly (#29), right after movement
 * 3. journey: fuel, speed, distance and all continuous hull damage (#102)
 * 4. breaches, then 5. fires: repairs only, never damage (#111, #122)
 * 6. fire spread, after fires have aged this tick (#129)
 * 7. course trigger, then 8. course: the trigger starts the event the course rule then runs (#136, #127)
 * After these, `stepSession` runs the hazard director and the win/lose check.
 */
export function createRunSystems(train: TrainMap, steeringConsole: Station): StepSystem[] {
  const movement: StepSystem = (state, dt, frame) => stepMovement(state, inputDirections(frame.inputs), dt, train);
  return [
    movement,
    createThrowSystem(train),
    journeySystem,
    breachSystem,
    fireSystem,
    fireSpreadSystem(train.hazardSpots),
    courseTriggerSystem(steeringConsole),
    courseSystem(steeringConsole),
  ];
}

/** The standard world: the three-car train and the waiting platform. */
export function createRoomWorld(): RoomWorld {
  const train = createTrainMap();
  const platform = createPlatformMap();
  const steeringConsole = train.stations.find((station) => station.kind === "steeringConsole");
  if (!steeringConsole) throw new Error("The train map has no steering console");
  return { train, platform, steeringConsole, systems: createRunSystems(train, steeringConsole) };
}

/**
 * A new, empty room waiting on the platform. Pass a number seed, or the room's own seeded random
 * source (the platform's `SeededRandom` fits `RandomSource`); either makes its hazards repeatable.
 */
export function createRoom(code: string, seed: number | RandomSource, world: RoomWorld): Room {
  const random = typeof seed === "number" ? createSeededRandom(seed) : seed;
  return { lobby: createPlatformLobby(createSession(code), world.platform), random };
}

const withSession = (room: Room, session: GameSession): Room =>
  session === room.lobby.session ? room : { ...room, lobby: { ...room.lobby, session } };

const fromSession = (room: Room, result: SessionResult): RoomResult =>
  result.ok
    ? { ok: true, room: withSession(room, result.session) }
    : { ok: false, room, error: result.error };

const refuse = (room: Room, error: ErrorCode, message?: string): RoomResult =>
  message === undefined ? { ok: false, room, error } : { ok: false, room, error, message };

// --- Checking messages from clients ---

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isStep = (value: unknown): value is -1 | 0 | 1 => value === -1 || value === 0 || value === 1;
/**
 * Only a loose bound here: the rules trim the name and give the friendly `invalidName` error for
 * 1–16 characters (`cleanPlayerName`), so a name with surrounding spaces still works. This only
 * stops absurdly long strings before they reach the rules.
 */
const isName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= PLAYER_NAME_MAX_LENGTH * 4;

/**
 * Checks the shape of anything a client sent and returns it as a `ClientMessage`, or null when
 * it is malformed. Only the fields each message needs are kept; extra fields are dropped.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "createRoom":
      return isName(raw.name) ? { type: "createRoom", name: raw.name } : null;
    case "joinRoom":
      return isName(raw.name) && typeof raw.code === "string" && raw.code.length <= 16
        ? { type: "joinRoom", name: raw.name, code: raw.code }
        : null;
    case "input": {
      const direction = raw.direction;
      if (!isRecord(direction) || !isStep(direction.dx) || !isStep(direction.dy)) return null;
      if (typeof raw.interacting !== "boolean") return null;
      return { type: "input", direction: { dx: direction.dx, dy: direction.dy }, interacting: raw.interacting };
    }
    case "configureRoom":
      // Any number passes here (even NaN); `isValidCrewSize` refuses non-integers and out-of-range sizes.
      return typeof raw.crewSize === "number" ? { type: "configureRoom", crewSize: raw.crewSize } : null;
    case "startGame":
    case "pickUpOrDrop":
    case "throw":
    case "playAgain":
      return { type: raw.type };
    default:
      return null;
  }
}

// --- Players arriving and leaving ---

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The first platform start nobody is standing on, so a new player never appears on top of
 * another one, even after someone in the middle left. If every start is taken (players are
 * standing on all of them), the start for the next seat is used.
 */
export function freePlatformSpawn(state: GameState, world: RoomWorld): Vec2 {
  const players = Object.values(state.players);
  const starts = world.platform.playerSpawns;
  const taken = (spot: Vec2): boolean => players.some((p) => distance(p.position, spot) < 2 * PLAYER_RADIUS);
  const free = starts.find((spot) => !taken(spot));
  return free ? { ...free } : platformSpawn(world.platform, players.length);
}

/** A player joins (or rejoins) the room. New players appear on a free platform start. */
export function joinRoom(room: Room, playerId: PlayerId, name: string, world: RoomWorld): RoomResult {
  const spawn = freePlatformSpawn(room.lobby.session.state, world);
  return fromSession(room, joinSession(room.lobby.session, playerId, name, spawn));
}

/** A player's connection dropped: they keep their seat until they reconnect or time out. */
export function disconnectFromRoom(room: Room, playerId: PlayerId): Room {
  return withSession(room, disconnectFromSession(room.lobby.session, playerId));
}

/** A player left for good, or their reconnect time ran out. */
export function leaveRoom(room: Room, playerId: PlayerId): Room {
  return withSession(room, leaveSession(room.lobby.session, playerId));
}

// --- The action key during a run ---


/**
 * The action key in a run: at the coal dispenser or the engine it takes or delivers coal;
 * anywhere else it picks up the nearest item or drops the held one.
 */
export function useRunAction(state: GameState, playerId: PlayerId, train: TrainMap): GameState {
  const player = state.players[playerId];
  if (state.phase !== "playing" || !player?.connected) return state;
  const station = train.stations
    .filter((s) => (s.kind === "coalDispenser" || s.kind === "engine") && distance(s.position, player.position) <= INTERACT_RANGE)
    .sort((a, b) => distance(a.position, player.position) - distance(b.position, player.position))[0];
  if (station) {
    const used = useCoalStation(state, playerId, station);
    if (used !== state) return used;
  }
  return pickUpOrDrop(state, playerId);
}

// --- Messages ---

/**
 * Departing and "play again" start a fresh session, which clears every player's held keys. The
 * keyboard only sends `input` when the keys change, so a player still holding a direction would
 * stand frozen until they let go and press again. Carry the held keys over for players still here.
 */
function keepHeldKeys(before: Room, after: RoomResult): RoomResult {
  if (!after.ok) return after;
  const previous = before.lobby.session.inputs;
  const session = after.room.lobby.session;
  if (session.state.phase === before.lobby.session.state.phase) return after;
  const inputs = { ...session.inputs };
  for (const [id, input] of Object.entries(previous)) {
    if (session.state.players[id]?.connected && !(id in inputs)) inputs[id] = input;
  }
  return { ok: true, room: withSession(after.room, { ...session, inputs }) };
}

/** Applies one message from `playerId`. The message must already be checked by `parseClientMessage`. */
export function handleMessage(room: Room, playerId: PlayerId, message: ClientMessage, world: RoomWorld): RoomResult {
  return keepHeldKeys(room, applyMessage(room, playerId, message, world));
}

function applyMessage(room: Room, playerId: PlayerId, message: ClientMessage, world: RoomWorld): RoomResult {
  const { session } = room.lobby;
  const phase = session.state.phase;

  switch (message.type) {
    case "createRoom":
    case "joinRoom":
      // The platform host turns a room code into this room; here the player only takes a seat.
      return joinRoom(room, playerId, message.name, world);

    case "input":
      return fromSession(room, applyInput(session, playerId, { direction: message.direction, interacting: message.interacting }));

    case "configureRoom":
      return fromSession(room, configureRoom(session, playerId, message.crewSize));

    case "startGame":
      // The host departs: the same rule as pulling the lever, from anywhere on the platform.
      return fromSession(room, departAndBoard(session, playerId, world.train));

    case "pickUpOrDrop": {
      if (phase === "lobby") {
        const result = usePlatformAction(room.lobby, playerId, world.platform, world.train);
        return result.ok
          ? { ok: true, room: { ...room, lobby: result.platform } }
          : refuse(room, "invalidMessage", result.message);
      }
      if (phase !== "playing") return refuse(room, "invalidMessage");
      const state = useRunAction(session.state, playerId, world.train);
      return { ok: true, room: withSession(room, { ...session, state }) };
    }

    case "throw": {
      if (phase !== "playing") return refuse(room, "invalidMessage");
      const state = throwItem(session.state, playerId);
      return { ok: true, room: withSession(room, { ...session, state }) };
    }

    case "playAgain": {
      const result = playAgainOnPlatform(session, world.platform);
      if (!result.ok) return refuse(room, result.error);
      // A fresh platform: the practice breach, wrench and boiler start over too.
      return { ok: true, room: { ...room, lobby: createPlatformLobby(result.session, world.platform) } };
    }
  }
}

// --- Ticks and syncing ---

/** Advances the room by `dt` seconds: walking and practice in the lobby, the rules in a run. */
export function stepRoom(room: Room, dt: number, world: RoomWorld): Room {
  const { session } = room.lobby;
  if (session.state.phase === "lobby") {
    const lobby = stepPlatformLobby(room.lobby, dt, world.platform);
    return lobby === room.lobby ? room : { ...room, lobby };
  }
  const next = stepSession(session, dt, { spots: world.train.hazardSpots, random: room.random, systems: world.systems });
  return withSession(room, next);
}

/** The state every browser should see: the platform with its practice objects in the lobby, otherwise the run. */
export function roomView(room: Room, world: RoomWorld): GameState {
  return room.lobby.session.state.phase === "lobby"
    ? platformLobbyView(room.lobby, world.platform)
    : room.lobby.session.state;
}
