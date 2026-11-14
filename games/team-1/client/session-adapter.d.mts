export type LobbyPlayer = {
  id: string;
  name: string;
  connected: boolean;
};

export type LobbySession = {
  code: string;
  playerId: string;
  players: LobbyPlayer[];
};

export type SessionEvent =
  | { type: "player-joined"; player: LobbyPlayer }
  | { type: "player-left"; player: LobbyPlayer };

export interface SessionAdapter {
  createSession(name: string): Promise<LobbySession>;
  joinSession(code: string, name: string): Promise<LobbySession>;
  leaveSession(): Promise<void>;
  subscribe(listener: (event: SessionEvent) => void): () => void;
}

/** `CONNECTION_FAILED` is only raised by the room-backed adapter (client/room-adapters.ts). */
export type SessionErrorCode = "INVALID_NAME" | "NOT_FOUND" | "SESSION_FULL" | "ALREADY_IN_SESSION" | "CONNECTION_FAILED";

export declare class SessionError extends Error {
  constructor(message: string, code: SessionErrorCode);
  readonly code: SessionErrorCode;
}

export declare class MockSessionAdapter implements SessionAdapter {
  createSession(name: string): Promise<LobbySession>;
  joinSession(code: string, name: string): Promise<LobbySession>;
  leaveSession(): Promise<void>;
  subscribe(listener: (event: SessionEvent) => void): () => void;
}
