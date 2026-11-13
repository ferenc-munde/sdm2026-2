import settings from "../config/game.json";

/** Room settings every game on the platform provides (see `server/template/README.md`). */
export interface RoomSettings {
  /** Simulation steps per second. */
  tickRate: number;
  /** State updates sent to the clients per second. */
  patchRate: number;
  /** The most players one room accepts. */
  maxPlayers: number;
  /** How long a dropped player's seat is kept, in seconds. */
  reconnectSeconds: number;
}

/** The smallest crew that can start a run. */
export const MIN_PLAYERS = 2;

/** Returns the reasons the settings are not usable; an empty list means they are valid. */
export function validateRoomSettings(value: RoomSettings): string[] {
  const problems: string[] = [];
  const positiveInteger = (name: keyof RoomSettings): void => {
    const n = value[name];
    if (!Number.isInteger(n) || n <= 0) problems.push(`${name} must be a positive integer`);
  };
  positiveInteger("tickRate");
  positiveInteger("patchRate");
  positiveInteger("maxPlayers");
  positiveInteger("reconnectSeconds");
  if (value.patchRate > value.tickRate) problems.push("patchRate must not be higher than tickRate");
  if (value.maxPlayers < MIN_PLAYERS) problems.push(`maxPlayers must be at least ${MIN_PLAYERS}`);
  return problems;
}

/** The room settings of this game, read from `config/game.json`. */
export const roomSettings: RoomSettings = settings;
