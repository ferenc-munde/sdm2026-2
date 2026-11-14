// Game state types. The server owns the state; clients only render it.

/**
 * A position on the train floor in world units. The game rules are 2D; the Three.js
 * client draws it at (x, 0, y), with y = 0 as the floor height.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/** One of 8 directions, or none. Each component is -1, 0 or 1. */
export interface Direction {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export type PlayerId = string;
export type ItemId = string;
export type HazardId = string;

export type ItemKind = "coal" | "wrench" | "extinguisher";

export interface Item {
  id: ItemId;
  kind: ItemKind;
  /** Where the item lies on the floor. Ignored while someone holds it. */
  position: Vec2;
  /** Player holding the item, or null when it is on the floor. */
  heldBy: PlayerId | null;
  /** Velocity while thrown (stretch, #29); zero when at rest. */
  velocity: Vec2;
}

export interface Player {
  id: PlayerId;
  name: string;
  position: Vec2;
  /** Last non-zero direction moved, used for throwing. */
  facing: Direction;
  /** Item currently held; a player holds at most one item. */
  heldItem: ItemId | null;
  connected: boolean;
  /** Course-failure knockback velocity; absent/zero outside an impact. */
  velocity?: Vec2;
  /** Remaining time during which movement input is ignored after hitting a wall. */
  stunnedSeconds?: number;
}

export type StationKind = "engine" | "coalDispenser" | "wrenchRack" | "extinguisherRack" | "steeringConsole";

export interface Station {
  kind: StationKind;
  car: number;
  position: Vec2;
}

export type HazardKind = "breach" | "fire" | "course";

export interface Hazard {
  id: HazardId;
  kind: HazardKind;
  car: number;
  /**
   * The map spot the hazard sits on (spot ids come from the map data, #6).
   * A fire on the "engine" spot stalls the train.
   */
  spotId: string;
  position: Vec2;
  /** Seconds the hazard has existed (fire spreads after FIRE_SPREAD_SECONDS). */
  age: number;
  /** Fire spread schedule in lifetime seconds; absent means first spread at 15. */
  nextSpreadAt?: number;
  /** Repair / extinguish progress from 0 to 1. */
  progress: number;
  /** Course hazard only: seconds left until it hits; null for other kinds. */
  countdown: number | null;
}

export interface Journey {
  fuel: number;
  hull: number;
  distance: number;
  /** 1.0, 0.5 or 0, derived from fuel and engine fire. */
  speedFactor: number;
}

export type Phase = "lobby" | "playing" | "won" | "lost";

/** The room's pre-game setup (#148): who hosts it and how many players the crew will have. */
export interface Lobby {
  /** The player who can change the setup and start the run; null while the room is empty. */
  hostId: PlayerId | null;
  /** How many players the crew will have (MIN_PLAYERS to MAX_PLAYERS). The room fills up to this. */
  crewSize: number;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  lobby: Lobby;
  /** Seconds since the run started. */
  time: number;
  players: Record<PlayerId, Player>;
  items: Record<ItemId, Item>;
  hazards: Record<HazardId, Hazard>;
  journey: Journey;
}
