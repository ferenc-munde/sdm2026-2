
 // The real adapters (issue #240): the lobby and the HUD talk to a platform room through the same
// SessionAdapter and GameStateAdapter interfaces the mocks implement. One RoomClient holds the
// connection and serves both, because the lobby player list and the game snapshot come from the
// same synced room state.
import { hostRoom, joinRoomByCode, JoinError, type GameConnection, type ServerAddress } from "@sdm/core/client";
// Type-only: the schema classes stay out of the browser bundle.
import type { TrainState } from "../shared/game";
import { sectionAt } from "../shared/train-layout";
import { MAX_NAME_LENGTH, type Phase } from "../shared/constants";
import type { GameClientSnapshot, GameInput, GamePlayer, GameTask, LiveGameStateAdapter } from "./game-state-adapter.mjs";
import { SessionError, type LobbyPlayer, type LobbySession, type SessionAdapter, type SessionEvent } from "./session-adapter.mjs";

type Connection = GameConnection<TrainState, GameInput>;
type ConnectionState = GameClientSnapshot["connectionState"];

/** How long to wait for the first synced state after the socket opened. */
const FIRST_STATE_TIMEOUT_MS = 5000;

const OUTCOME_MESSAGES: Record<Phase, string> = {
  lobby: "Waiting for departure.",
  playing: "Keep the train moving.",
  victory: "Your crew brought the Night Line safely through.",
  failure: "The train lost power before reaching the station.",
};

type PlayerMotion = {
  x: number;
  z: number;
  direction: NonNullable<GamePlayer["direction"]>;
  isMoving: boolean;
};

export class PlayerMotionTracker {
  private players = new Map<string, PlayerMotion>();
  private phase: Phase | undefined;
  private runTicks = 0;
  private suspended = false;

  update(state: TrainState): void {
    const sameRun = !this.suspended && this.phase === "playing" && state.phase === "playing" && state.runTicks >= this.runTicks;
    const tickAdvanced = state.runTicks > this.runTicks;
    const next = new Map<string, PlayerMotion>();
    state.players.forEach((player, id) => {
      const previous = this.players.get(id);
      let direction = previous?.direction ?? "down";
      if (player.connected && state.phase === "playing" && (player.moveX !== 0 || player.moveZ !== 0)) {
        direction = Math.abs(player.moveZ) > Math.abs(player.moveX)
          ? (player.moveZ < 0 ? "up" : "down")
          : (player.moveX < 0 ? "left" : "right");
      }
      const isMoving = Boolean(player.connected && previous && sameRun && (
        tickAdvanced ? player.x !== previous.x || player.z !== previous.z : previous.isMoving
      ));
      next.set(id, { x: player.x, z: player.z, direction, isMoving });
    });
    this.players = next;
    this.phase = state.phase;
    this.runTicks = state.runTicks;
    this.suspended = false;
  }

  get(id: string): PlayerMotion | undefined {
    return this.players.get(id);
  }

  suspend(): void {
    this.suspended = true;
    for (const player of this.players.values()) player.isMoving = false;
  }

  clear(): void {
    this.players.clear();
    this.phase = undefined;
    this.runTicks = 0;
    this.suspended = false;
  }
}

/** Maps the synced room state to the snapshot the HUD and the scene draw. */
export function toSnapshot(state: TrainState | undefined, connectionState: ConnectionState, localPlayerId?: string): GameClientSnapshot {
  const players: Array<GameClientSnapshot["players"][number] & { seat: number }> = [];

  // Before the first state arrives the collections do not exist yet.
  state?.players?.forEach((player, id) => {
    players.push({
      id,
      name: player.name,
      connected: player.connected,
      position: { x: player.x, z: player.z },
      color: player.color,
      ...(player.signal && { signal: player.signal }),
      section: sectionAt(player.x),
      seat: player.seat,
    });
  });

  players.sort((a, b) => a.seat - b.seat);

  const tasks: GameTask[] = [];
  state?.tasks?.forEach((task) => {
    tasks.push({
      id: task.id,
      label: task.label,
      section: task.section as GameClientSnapshot["tasks"][number]["section"],
      status: task.progress >= 100 ? "complete" : task.progress > 0 ? "in-progress" : "available",
      progress: task.progress,
      calibrationStep: task.calibrationStep,
    });
  });

  const phase: Phase = state?.phase ?? "lobby";

  return {
    connectionState,
    players: players.map(({ seat: _seat, ...player }) => player),
    secondsRemaining: state?.secondsRemaining ?? 0,
    trainCondition: state?.trainCondition ?? 100,
    repairs: {
      completed: tasks.filter((task) => task.status === "complete").length,
      total: tasks.length,
    },
    tasks,
    ...(localPlayerId ? { localPlayerId } : {}),
    outcome: {
      kind: phase === "victory" || phase === "failure" ? phase : "playing",
      message: OUTCOME_MESSAGES[phase],
    },
    phase,
  };
}

/** Turns a failed create or join into the error the lobby already knows how to show. */
export function toSessionError(error: unknown): SessionError {
  if (error instanceof SessionError) return error;

  if (error instanceof JoinError) {
    if (error.reason === "roomNotFound") {
      return new SessionError("That crew code was not found. Check it and try again.", "NOT_FOUND");
    }

    if (error.reason === "roomFull") {
      return new SessionError("This train is full. The crew limit is four.", "SESSION_FULL");
    }

    // The only join option is the name, so a rejected join means the room refused the name.
    if (error.reason === "rejected") {
      return new SessionError(`The train refused that crew name. Use 1 to ${MAX_NAME_LENGTH} characters.`, "INVALID_NAME");
    }
  }

  return new SessionError("The game server could not be reached. Check that it is running and try again.", "CONNECTION_FAILED");
}

function normalizedName(rawName: string): string {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH).trim();

  if (!name) {
    throw new SessionError("Enter a crew name to continue.", "INVALID_NAME");
  }

  return name;
}

/** One room connection. Both adapters from createRoomAdapters() are views on it. */
export class RoomClient {
  private connection: Connection | undefined;
  private opening = false;
  private connectionState: ConnectionState = "disconnected";
  /** The players the lobby has been told about, by id. */
  private known = new Map<string, LobbyPlayer>();
  private lastSnapshot = "";
  private readonly motion = new PlayerMotionTracker();
  private readonly sessionListeners = new Set<(event: SessionEvent) => void>();
  private readonly snapshotListeners = new Set<(snapshot: GameClientSnapshot) => void>();

  constructor(private readonly server: ServerAddress) {}

  createSession(rawName: string): Promise<LobbySession> {
    return this.open(rawName, (name) => hostRoom<TrainState, GameInput>(this.server, { name }));
  }

  joinSession(rawCode: string, rawName: string): Promise<LobbySession> {
    return this.open(
      rawName,
      (name) => joinRoomByCode<TrainState, GameInput>(
        this.server,
        rawCode.trim().toUpperCase(),
        { name },
      ),
    );
  }

  async leaveSession(): Promise<void> {
    const connection = this.connection;
    if (!connection) return;

    this.reset();
    await connection.leave().catch(() => undefined);
  }

  subscribeSession(listener: (event: SessionEvent) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  subscribeSnapshot(listener: (snapshot: GameClientSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  getSnapshot(): GameClientSnapshot {
    const snapshot = toSnapshot(
      this.connection?.state(),
      this.connectionState,
      this.connection?.sessionId,
    );
    snapshot.players = snapshot.players.map((player) => {
      const motion = this.motion.get(player.id);
      return {
        ...player,
        direction: motion?.direction ?? "down",
        isMoving: this.connectionState === "connected" && player.connected && (motion?.isMoving ?? false),
      };
    });
    return snapshot;
  }

  sendInput(input: GameInput): void {
    if (this.connectionState === "connected") {
      this.connection?.send(input);
    }
  }

  private async open(
    rawName: string,
    connect: (name: string) => Promise<Connection>,
  ): Promise<LobbySession> {
    if (this.connection || this.opening) {
      throw new SessionError("Leave your current crew before joining another.", "ALREADY_IN_SESSION");
    }

    const name = normalizedName(rawName);
    this.opening = true;
    this.connectionState = "connecting";

    let connection: Connection | undefined;

    try {
      connection = await connect(name);
      this.connection = connection;
      await this.firstState(connection);
    } catch (error) {
      this.reset();
      await connection?.leave().catch(() => undefined);
      throw toSessionError(error);
    } finally {
      this.opening = false;
    }

    this.connectionState = "connected";
    this.motion.update(connection.state());
    this.known = this.lobbyPlayers(connection);

    const live = connection;
    live.onState(() => this.handleState(live));
    live.room.onDrop(() => this.setConnectionState(live, "reconnecting"));
    live.room.onReconnect(() => this.setConnectionState(live, "connected"));
    live.onClosed(() => this.handleClosed(live));

    this.publish();

    return {
      code: live.code(),
      playerId: live.sessionId,
      players: [...this.known.values()],
    };
  }

  /** Resolves when the room code and this player's own entry have been synced. */
  private firstState(connection: Connection): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(
        () => finish(new JoinError("connectionFailed", "the room sent no state")),
        FIRST_STATE_TIMEOUT_MS,
      );

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (error) reject(error);
        else resolve();
      };

      const check = () => {
        if (connection.code() && connection.state()?.players?.has(connection.sessionId)) {
          finish();
        }
      };

      connection.onState(check);
      connection.onClosed(() => finish(new JoinError("connectionFailed", "the room closed before it sent its state")));
      check();
    });
  }

  private lobbyPlayers(connection: Connection): Map<string, LobbyPlayer> {
    const players = toSnapshot(connection.state(), "connected").players;
    return new Map(players.map(({ id, name, connected }) => [id, { id, name, connected }]));
  }

  private handleState(connection: Connection): void {
    if (this.connection !== connection) return;

    this.motion.update(connection.state());
    const current = this.lobbyPlayers(connection);
    const events: SessionEvent[] = [];

    for (const [id, player] of this.known) {
      if (!current.has(id)) {
        events.push({ type: "player-left", player });
      }
    }

    for (const [id, player] of current) {
      if (!this.known.has(id)) {
        events.push({ type: "player-joined", player });
      }
    }

    this.known = current;

    for (const event of events) {
      for (const listener of this.sessionListeners) {
        listener(event);
      }
    }

    this.publish();
  }

  private setConnectionState(connection: Connection, next: ConnectionState): void {
    if (this.connection !== connection) return;

    if (next !== "connected") this.motion.suspend();
    this.connectionState = next;
    this.publish();
  }

  private handleClosed(connection: Connection): void {
    if (this.connection !== connection) return;

    this.reset();
    this.publish();
  }

  private reset(): void {
    this.connection = undefined;
    this.connectionState = "disconnected";
    this.known = new Map();
    this.lastSnapshot = "";
    this.motion.clear();
  }

  /** Tells the HUD about the new snapshot. The server's tick counter changes 20 times a second, the snapshot does not. */
  private publish(): void {
    const snapshot = this.getSnapshot();
    const serialized = JSON.stringify(snapshot);

    if (serialized === this.lastSnapshot) return;

    this.lastSnapshot = serialized;

    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }
}

export interface RoomAdapters {
  session: SessionAdapter;
  game: LiveGameStateAdapter;
}

/** The two adapters the client uses, backed by one room connection to `server`. */
export function createRoomAdapters(server: ServerAddress): RoomAdapters {
  const client = new RoomClient(server);

  return {
    session: {
      createSession: (name) => client.createSession(name),
      joinSession: (code, name) => client.joinSession(code, name),
      leaveSession: () => client.leaveSession(),
      subscribe: (listener) => client.subscribeSession(listener),
    },
    game: {
      getSnapshot: () => client.getSnapshot(),
      subscribe: (listener) => client.subscribeSnapshot(listener),
      sendInput: (input) => client.sendInput(input),
    },
  };
}
