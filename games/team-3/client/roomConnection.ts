// The browser's connection to the game room on the platform host (#220).
//
// Creating a room is one call (`client.create`); joining by code is two, as the platform
// documents (server/docs/LOBBY_AND_JOIN.md): the join route turns the code into a room id, then
// the SDK joins by id. After that every game message goes out in the platform's input envelope,
// and the synced `LastTrainState` is read back with `readView` and `readNotice` (#209).

import { Client, type Room } from "@colyseus/sdk";
import { MESSAGES, ROUTES } from "@sdm/core/shared";
import { readNotice, readView, type LastTrainState, type Notice } from "../shared/game.ts";
import type { ClientMessage } from "../shared/messages.ts";
import type { GameState, PlayerId } from "../shared/types.ts";

/** The room name every game registers on the platform host (`GAME_ROOM_NAME` in @sdm/host). */
export const GAME_ROOM = "game";

/** Where the room server is: `http(s)://host:port`; the WebSocket address is derived from it. */
export interface ServerAddress {
  http: string;
  ws: string;
}

/** The parts of `window.location` the server address is built from. */
export interface PageLocation {
  protocol: string;
  hostname: string;
  host: string;
  pathname: string;
}

/**
 * The server address for this page (#22):
 * 1. `VITE_SERVER_URL`, set at build time, wins.
 * 2. On the Vite dev server (`pnpm run dev`), the game server runs next to it on port 2567.
 * 3. Otherwise the game server itself served this page (`@sdm/host` serves `dist/`), so it is the
 *    page's own origin and folder; that also works behind the platform gateway under `/team-3/`.
 */
export function serverAddress(page: PageLocation, configured?: string, devServer = false): ServerAddress {
  const folder = page.pathname.replace(/[^/]*$/, "");
  const http =
    (configured && configured.trim()) ||
    (devServer ? `${page.protocol}//${page.hostname}:2567` : `${page.protocol}//${page.host}${folder}`);
  const clean = http.replace(/\/+$/, "");
  return { http: clean, ws: clean.replace(/^http/, "ws") };
}

/** Wraps each message in the platform's envelope; `seq` rises by one per message, as the host requires. */
export function createEnvelopes(): (message: ClientMessage) => { seq: number; input: ClientMessage } {
  let seq = 0;
  return (message) => ({ seq: ++seq, input: message });
}

export interface RoomConnection {
  /** This player's id in the game: the platform session id. */
  readonly me: PlayerId;
  /** The room code to share. */
  code(): string;
  /** The game state to draw, or null before the first tick. */
  view(): GameState | null;
  /** The room's last refusal for this player, if any. */
  notice(): Notice | null;
  send(message: ClientMessage): void;
  /** Called when the connection closes for any reason other than `leave()`. */
  onClosed(listener: () => void): void;
  leave(): Promise<void>;
}

function wrap(room: Room): RoomConnection {
  const envelope = createEnvelopes();
  let leaving = false;
  const state = (): LastTrainState => room.state as LastTrainState;
  return {
    me: room.sessionId,
    code: () => state()?.code ?? "",
    view: () => (state() ? readView(state()) : null),
    notice: () => (state() ? readNotice(state(), room.sessionId) : null),
    send: (message) => room.send(MESSAGES.input, envelope(message)),
    onClosed: (listener) => room.onLeave(() => { if (!leaving) listener(); }),
    leave: async () => {
      leaving = true;
      await room.leave();
    },
  };
}

/** Why joining by code failed, in the game's error codes so the screens can explain it. */
export type JoinFailure = "roomNotFound" | "roomFull" | "connectionFailed";

export type JoinResult = { ok: true; connection: RoomConnection } | { ok: false; error: JoinFailure };

/** Creates a new room and takes a seat in it with `name`. */
export async function createRoom(server: ServerAddress, name: string): Promise<RoomConnection> {
  const room = await new Client(server.ws).create(GAME_ROOM);
  const connection = wrap(room);
  connection.send({ type: "createRoom", name });
  return connection;
}

/** Joins the room with this code and takes a seat in it with `name`. */
export async function joinRoomByCode(server: ServerAddress, code: string, name: string): Promise<JoinResult> {
  let response: Response;
  try {
    response = await fetch(`${server.http}${ROUTES.joinRoom}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    return { ok: false, error: "connectionFailed" };
  }
  if (response.status === 404) return { ok: false, error: "roomNotFound" };
  if (response.status === 409) return { ok: false, error: "roomFull" };
  if (!response.ok) return { ok: false, error: "connectionFailed" };

  try {
    const { roomId } = (await response.json()) as { roomId: string };
    const connection = wrap(await new Client(server.ws).joinById(roomId));
    connection.send({ type: "joinRoom", name, code });
    return { ok: true, connection };
  } catch {
    return { ok: false, error: "connectionFailed" };
  }
}
