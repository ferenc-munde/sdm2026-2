export type GamePlayer = {
  id: string;
  name: string;
  connected: boolean;
  position: { x: number; z: number };
  color: string;
  /** Derived from the authoritative position for repair guidance. */
  section?: "engine" | "electrical" | "control" | "passenger" | "rear";
};

export type TaskStatus = "available" | "in-progress" | "complete";

export type GameTask = {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number;
  section?: "engine" | "electrical" | "control" | "passenger" | "rear";
};

export type GameOutcome = {
  kind: "playing" | "victory" | "failure";
  message: string;
};

export type GameClientSnapshot = {
  connectionState: "connecting" | "connected" | "reconnecting" | "disconnected";
  players: GamePlayer[];
  secondsRemaining: number;
  trainCondition: number;
  repairs: { completed: number; total: number };
  tasks: GameTask[];
  outcome: GameOutcome;
  /** Session id for this browser's player in a live room. */
  localPlayerId?: string;
  /** The room's phase. Only the room-backed adapter sets it; mock snapshots leave it out. */
  phase?: "lobby" | "playing" | "victory" | "failure";
};

export interface GameStateAdapter {
  getSnapshot(): GameClientSnapshot;
  subscribe(listener: (snapshot: GameClientSnapshot) => void): () => void;
}

/** What a player can send to the room. The same shape as `TrainInput` in shared/game.ts. */
export type GameInput =
  | { type: "move"; x: number; z: number }
  | { type: "start" }
  | { type: "repair" };

export interface GameInputSender {
  sendInput(input: GameInput): void;
}

/** A game-state source that also accepts input: the room-backed adapter. */
export interface LiveGameStateAdapter extends GameStateAdapter, GameInputSender {}

export declare class MockGameStateAdapter implements GameStateAdapter {
  constructor(initialState: GameClientSnapshot);
  getSnapshot(): GameClientSnapshot;
  subscribe(listener: (snapshot: GameClientSnapshot) => void): () => void;
  publish(snapshot: GameClientSnapshot): void;
}

export declare function createPreviewSnapshot(players?: Array<Pick<GamePlayer, "id" | "name" | "connected">>): GameClientSnapshot;
