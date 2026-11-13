export type GamePlayer = {
  id: string;
  name: string;
  connected: boolean;
  position: { x: number; z: number };
  color: string;
};

export type TaskStatus = "available" | "in-progress" | "complete";

export type GameTask = {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number;
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
};

export interface GameStateAdapter {
  getSnapshot(): GameClientSnapshot;
  subscribe(listener: (snapshot: GameClientSnapshot) => void): () => void;
}

export declare class MockGameStateAdapter implements GameStateAdapter {
  constructor(initialState: GameClientSnapshot);
  getSnapshot(): GameClientSnapshot;
  subscribe(listener: (snapshot: GameClientSnapshot) => void): () => void;
  publish(snapshot: GameClientSnapshot): void;
}

export declare function createPreviewSnapshot(players?: Array<Pick<GamePlayer, "id" | "name" | "connected">>): GameClientSnapshot;
