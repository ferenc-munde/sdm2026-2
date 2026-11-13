/**
 * Local preview transport. This in-memory adapter does not connect browsers
 * or a game server. A real adapter can implement the same typed contract.
 */

const MAX_PLAYERS = 4;
const sessions = new Map();
sessions.set("DEMO", {
  players: [{ id: "preview-conductor", name: "Preview Conductor", connected: true }],
  members: new Set(),
});
let nextCode = 1;
let nextPlayer = 1;

function normalizedName(rawName) {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 18);
  if (!name) throw new SessionError("Enter a crew name to continue.", "INVALID_NAME");
  return name;
}

function emit(session, event, except) {
  for (const member of session.members) {
    if (member !== except) member.notify(event);
  }
}

export class SessionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

/** Local, in-memory preview only. It does not connect browsers or a backend. */
export class MockSessionAdapter {
  activeCode;
  ownPlayer;
  listeners = new Set();

  async createSession(rawName) {
    this.ensureOutsideSession();
    const player = this.newPlayer(normalizedName(rawName));
    const code = (nextCode++).toString(36).toUpperCase().padStart(4, "0");
    const session = { players: [player], members: new Set([this]) };
    sessions.set(code, session);
    this.activeCode = code;
    this.ownPlayer = player;
    return this.snapshot(code, session);
  }

  async joinSession(rawCode, rawName) {
    this.ensureOutsideSession();
    const name = normalizedName(rawName);
    const code = rawCode.trim().toUpperCase();
    const session = sessions.get(code);
    if (!session) throw new SessionError("That crew code was not found. Check it and try again.", "NOT_FOUND");
    if (session.players.length >= MAX_PLAYERS) throw new SessionError("This train is full. The crew limit is four.", "SESSION_FULL");

    const player = this.newPlayer(name);
    session.players.push(player);
    session.members.add(this);
    this.activeCode = code;
    this.ownPlayer = player;
    emit(session, { type: "player-joined", player }, this);
    return this.snapshot(code, session);
  }

  async leaveSession() {
    if (!this.activeCode || !this.ownPlayer) return;
    const code = this.activeCode;
    const session = sessions.get(code);
    const player = this.ownPlayer;
    this.activeCode = undefined;
    this.ownPlayer = undefined;
    if (!session) return;

    session.players = session.players.filter((candidate) => candidate.id !== player.id);
    session.members.delete(this);
    emit(session, { type: "player-left", player });
    if (session.players.length === 0) sessions.delete(code);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @internal Used by the in-memory adapter to fan out local preview events. */
  notify(event) {
    for (const listener of this.listeners) listener(event);
  }

  ensureOutsideSession() {
    if (this.activeCode) throw new SessionError("Leave your current crew before joining another.", "ALREADY_IN_SESSION");
  }

  newPlayer(name) {
    return { id: `local-${nextPlayer++}`, name, connected: true };
  }

  snapshot(code, session) {
    return {
      code,
      playerId: this.ownPlayer.id,
      players: session.players.map((player) => ({ ...player })),
    };
  }
}
