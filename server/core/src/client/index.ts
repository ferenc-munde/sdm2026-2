// The browser's connection to a game room on the platform host: create a room, join one by its code,
// send inputs in the platform's envelope, read the synced state. Every game's client uses this instead
// of writing its own, so all games create and join rooms the same way (server/docs/LOBBY_AND_JOIN.md).
import { Client, type Room } from "@colyseus/sdk";
import { GAME_ROOM_NAME, MESSAGES, ROUTES, type InputEnvelope, type JoinRoomResponse } from "../shared";

/** Where the game server is: `http(s)://host:port`, and the WebSocket address derived from it. */
export interface ServerAddress {
  http: string;
  ws: string;
}

const LOCAL_SERVER_PORT = 2567;

/** The parts of `window.location` the server address is built from. Pass `window.location` itself. */
export interface PageLocation {
  protocol: string;
  hostname: string;
  /** Host with the port, for example `games.example:8443`. Falls back to `hostname`. */
  host?: string;
  /** The page's path, for example `/team-2/index.html`. Falls back to `/`. */
  pathname?: string;
}

/**
 * True on the Vite dev server (`pnpm dev`), false in a production build. Vite replaces
 * `import.meta.env.DEV` when it bundles this file into a game's client; where there is no Vite
 * (plain Node), it is false.
 */
function onViteDevServer(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
}

/**
 * The server address for a page:
 * 1. A configured address (for example `import.meta.env.VITE_SERVER_URL`) wins.
 * 2. On the Vite dev server the game server runs next to the page on port 2567.
 * 3. Otherwise the game server itself served the page (`@sdm/host` serves the built client), so the
 *    address is the page's own origin and folder. That also works behind the gateway under `/team-N/`.
 *
 * `devServer` is detected from Vite; pass it only to override that, as the tests do.
 */
export function serverAddress(page: PageLocation, configured?: string, devServer: boolean = onViteDevServer()): ServerAddress {
  const folder = (page.pathname ?? "/").replace(/[^/]*$/, "");
  const fallback = devServer
    ? `${page.protocol}//${page.hostname}:${LOCAL_SERVER_PORT}`
    : `${page.protocol}//${page.host ?? page.hostname}${folder}`;
  const http = (configured?.trim() || fallback).replace(/\/+$/, "");
  return { http, ws: http.replace(/^http/, "ws") };
}

/** Wraps each input in the platform's envelope; `seq` starts at 1 and rises by one, as the host requires. */
export function createInputEnvelopes<I>(): (input: I) => InputEnvelope & { input: I } {
  let seq = 0;
  return (input) => ({ seq: ++seq, input });
}

export type JoinFailure =
  /** No live room has this code. */
  | "roomNotFound"
  /** The room has no free seat. */
  | "roomFull"
  /** The room refused the join options (for example an invalid name); `message` says why. */
  | "rejected"
  /** The server could not be reached, or answered with something unexpected. */
  | "connectionFailed";

export class JoinError extends Error {
  constructor(
    readonly reason: JoinFailure,
    message: string = reason,
  ) {
    super(message);
    this.name = "JoinError";
  }
}

/** A seat in a game room. `S` is the game's state class, `I` its input type. */
export interface GameConnection<S, I> {
  /** This player's id in the game: the session id, the key of `state.seats`. */
  readonly sessionId: string;
  readonly roomId: string;
  /** The underlying Colyseus room, for what this interface does not cover (custom messages, reconnection). */
  readonly room: Room<any, S>;
  /** The synced game state. It is filled in when the first state arrives. */
  state(): S;
  /** The room code to share, `""` until the first state arrived. */
  code(): string;
  /** Sends one input; the envelope and its sequence number are added here. */
  send(input: I): void;
  /** Calls `listener` every time the server's state changes. */
  onState(listener: (state: S) => void): void;
  /** Calls `listener` when the connection ends for any reason other than `leave()`. */
  onClosed(listener: (code: number) => void): void;
  leave(): Promise<void>;
}

function wrap<S, I>(room: Room<any, S>): GameConnection<S, I> {
  const envelope = createInputEnvelopes<I>();
  let leaving = false;
  return {
    sessionId: room.sessionId,
    roomId: room.roomId,
    room,
    state: () => room.state,
    code: () => (room.state as { code?: string } | undefined)?.code ?? "",
    send: (input) => room.send(MESSAGES.input, envelope(input)),
    onState: (listener) => {
      room.onStateChange((state) => listener(state));
    },
    onClosed: (listener) => {
      room.onLeave((code) => {
        if (!leaving) listener(code);
      });
    },
    leave: async () => {
      leaving = true;
      await room.leave();
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates a new room and takes the first seat in it. `joinOptions` go to the game's `join` hook after its
 * `joinOptionsSchema` checked them (for example `{ name: "Ada" }`).
 */
export async function hostRoom<S = unknown, I = unknown>(
  server: ServerAddress,
  joinOptions?: Record<string, unknown>,
  roomName: string = GAME_ROOM_NAME,
): Promise<GameConnection<S, I>> {
  try {
    return wrap<S, I>(await new Client(server.ws).create<S>(roomName, joinOptions));
  } catch (error) {
    const message = describe(error);
    throw new JoinError(message.includes("can't join") ? "rejected" : "connectionFailed", message);
  }
}

/**
 * Joins the room with this code. Two calls, as the platform documents: the join route turns the code into
 * a room id, then the SDK joins by id. Throws a `JoinError` whose `reason` says what went wrong.
 */
export async function joinRoomByCode<S = unknown, I = unknown>(
  server: ServerAddress,
  code: string,
  joinOptions?: Record<string, unknown>,
): Promise<GameConnection<S, I>> {
  let response: Response;
  try {
    response = await fetch(`${server.http}${ROUTES.joinRoom}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
  } catch (error) {
    throw new JoinError("connectionFailed", describe(error));
  }
  if (response.status === 404) throw new JoinError("roomNotFound");
  if (response.status === 409) throw new JoinError("roomFull");
  if (!response.ok) throw new JoinError("connectionFailed", `the join route answered ${response.status}`);

  let roomId: string;
  try {
    ({ roomId } = (await response.json()) as JoinRoomResponse);
  } catch (error) {
    throw new JoinError("connectionFailed", describe(error));
  }
  try {
    return wrap<S, I>(await new Client(server.ws).joinById<S>(roomId, joinOptions));
  } catch (error) {
    const message = describe(error);
    throw new JoinError(message.includes("can't join") ? "rejected" : "connectionFailed", message);
  }
}
