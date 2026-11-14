// The server-side simulation of one game room: applies every event to the game's state and records it,
// so a replay re-runs to the same state hash. Node only (uses node:crypto); the Colyseus room in
// @sdm/host drives it, and `runReplay` drives the same class headless.
import { createHash } from "node:crypto";
import { SeededRandom, type Replay, type ReplayEvent } from "../shared";
import {
  Seat,
  type BaseState,
  type GameContext,
  type GameDefinition,
  type PlayerInput,
  type RoomSettings,
} from "../sim";

/** A room records at most this many events; after that the replay is marked `truncated`. */
export const MAX_RECORDED_EVENTS = 200_000;

/** The room code is random per room and not part of the game rules, so the hash leaves it out. */
export function hashState(state: BaseState): string {
  const { code: _code, ...rest } = state.toJSON() as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export class JoinRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`can't join: ${reason}`);
    this.name = "JoinRejectedError";
  }
}

export class Simulation<S extends BaseState, C extends RoomSettings, I, J = unknown> {
  readonly state: S;
  readonly config: C;
  readonly seed: number;
  private readonly ctx: GameContext<C>;
  private readonly events: ReplayEvent[] = [];
  private pending: PlayerInput<I>[] = [];
  private truncated = false;
  private started = false;

  constructor(
    private readonly game: GameDefinition<S, C, I, J>,
    rawConfig: unknown,
    seed: number,
  ) {
    this.config = game.configSchema.parse(rawConfig);
    this.seed = seed >>> 0;
    this.ctx = { random: new SeededRandom(this.seed), config: this.config };
    this.state = game.createState(this.config);
  }

  /** Runs the game's `init`. Separate from the constructor so the host can set the room code first. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.game.init(this.state, this.ctx);
  }

  get tick(): number {
    return this.state.tick;
  }

  get isPaused(): boolean {
    return this.state.paused;
  }

  /** Checks the join options before the seat exists, so a rejected join leaves no trace in the state. */
  join(playerId: string, options?: unknown): void {
    let checked = undefined as J;
    if (this.game.joinOptionsSchema) {
      const parsed = this.game.joinOptionsSchema.safeParse(options ?? {});
      if (!parsed.success) throw new JoinRejectedError(parsed.error.issues.map((issue) => issue.message).join("; "));
      checked = parsed.data;
    }
    const seat = new Seat();
    seat.playerId = playerId;
    this.state.seats.set(playerId, seat);
    this.record({ type: "join", tick: this.tick, playerId, ...(options === undefined ? {} : { options }) });
    this.game.join(this.state, playerId, this.ctx, checked);
  }

  drop(playerId: string): void {
    const seat = this.state.seats.get(playerId);
    if (seat) seat.connected = false;
    this.record({ type: "drop", tick: this.tick, playerId });
    this.game.disconnect?.(this.state, playerId, this.ctx);
  }

  reconnect(playerId: string): void {
    const seat = this.state.seats.get(playerId);
    if (seat) seat.connected = true;
    this.record({ type: "reconnect", tick: this.tick, playerId });
    this.game.reconnect?.(this.state, playerId, this.ctx);
  }

  leave(playerId: string): void {
    this.record({ type: "leave", tick: this.tick, playerId });
    this.game.leave(this.state, playerId, this.ctx);
    this.state.seats.delete(playerId);
  }

  /**
   * Queues one input for the next tick. Returns "accepted", "stale" (a repeated or older `seq`, ignored)
   * or "invalid" (no seat, or the input fails the game's schema).
   */
  input(playerId: string, seq: number, raw: unknown): "accepted" | "stale" | "invalid" {
    const seat = this.state.seats.get(playerId);
    if (!seat) return "invalid";
    if (seq <= seat.lastSeq) return "stale";
    const parsed = this.game.inputSchema.safeParse(raw);
    if (!parsed.success) return "invalid";
    seat.lastSeq = seq;
    this.pending.push({ playerId, input: parsed.data });
    this.record({ type: "input", tick: this.tick, playerId, seq, input: raw });
    return "accepted";
  }

  /** Runs a debug command; returns false for an unknown name. The caller decides whether debugging is allowed. */
  debug(playerId: string, name: string, args?: unknown): boolean {
    const run = this.game.commands?.[name];
    if (!run) return false;
    this.record({ type: "debug", tick: this.tick, playerId, name, ...(args === undefined ? {} : { args }) });
    run(this.state, args, this.ctx);
    return true;
  }

  /** Advances one tick with the queued inputs. Returns false (and changes nothing) while the game is paused. */
  step(): boolean {
    if (this.state.paused) return false;
    const inputs = this.pending;
    this.pending = [];
    this.state.tick += 1;
    this.game.step(this.state, inputs, this.ctx);
    return true;
  }

  hash(): string {
    return hashState(this.state);
  }

  toReplay(): Replay {
    return {
      version: 1,
      game: this.game.id,
      seed: this.seed,
      config: this.config,
      ticks: this.tick,
      events: [...this.events],
      ...(this.truncated ? { truncated: true } : {}),
      finalHash: this.hash(),
    };
  }

  private record(event: ReplayEvent): void {
    if (this.events.length >= MAX_RECORDED_EVENTS) {
      this.truncated = true;
      return;
    }
    this.events.push(event);
  }
}

export interface ReplayResult<S extends BaseState> {
  state: S;
  hash: string;
  /** True when the replay carried a `finalHash` and the re-run reproduced it. */
  matches: boolean | undefined;
}

/** Re-runs a recorded replay headless with the same game and returns the final state and its hash. */
export function runReplay<S extends BaseState, C extends RoomSettings, I, J = unknown>(
  game: GameDefinition<S, C, I, J>,
  replay: Replay,
): ReplayResult<S> {
  if (replay.game !== game.id) throw new Error(`replay is for game "${replay.game}", not "${game.id}"`);
  if (replay.truncated) throw new Error("a truncated replay cannot be re-run");
  const sim = new Simulation(game, replay.config, replay.seed);
  sim.start();
  let next = 0;
  const applyEventsAtThisTick = () => {
    while (next < replay.events.length && (replay.events[next] as ReplayEvent).tick <= sim.tick) {
      const event = replay.events[next++] as ReplayEvent;
      if (event.type === "join") sim.join(event.playerId, event.options);
      else if (event.type === "leave") sim.leave(event.playerId);
      else if (event.type === "drop") sim.drop(event.playerId);
      else if (event.type === "reconnect") sim.reconnect(event.playerId);
      else if (event.type === "input") sim.input(event.playerId, event.seq, event.input);
      else sim.debug(event.playerId, event.name, event.args);
    }
  };
  while (sim.tick < replay.ticks) {
    applyEventsAtThisTick();
    if (!sim.step()) break;
  }
  applyEventsAtThisTick();
  const hash = sim.hash();
  return { state: sim.state, hash, matches: replay.finalHash === undefined ? undefined : replay.finalHash === hash };
}
