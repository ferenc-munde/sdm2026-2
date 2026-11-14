import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import { CloseCode, Room, type Client } from "colyseus";
import {
  DebugCommandSchema,
  InputEnvelopeSchema,
  MESSAGES,
  ROUTES,
  isDebugEnabled,
  type AppEnv,
} from "@sdm/core/shared";
import { JoinRejectedError, Simulation } from "@sdm/core/server";
import { type BaseState, type GameDefinition, type RoomSettings } from "@sdm/core/sim";
import type { Logger } from "./logger";
import type { RoomRegistry, RoomStats } from "./registry";
import { TokenBucket, type ReplayStore } from "./replays";

/** A client may send this many inputs per second; the rest are dropped and counted. */
export const INPUTS_PER_SECOND = 100;
/** A client that sends this many invalid inputs in a row is removed from the room. */
export const MAX_INVALID_INPUTS_IN_A_ROW = 10;
/** How often a room writes its stats line to the log. */
export const ROOM_STATS_LOG_SECONDS = 10;

export interface HostDeps {
  env: AppEnv;
  sha: string;
  gameId: string;
  logger: Logger;
  registry: RoomRegistry;
  /** Where a room keeps its replay after it closed. */
  replays: ReplayStore;
  /** Raw contents of the game's config/game.json, validated by the game's config schema. */
  config: unknown;
}

interface ClientLimits {
  bucket: TokenBucket;
  invalidInARow: number;
}

export function createGameRoom<S extends BaseState, C extends RoomSettings, I, J = unknown>(
  game: GameDefinition<S, C, I, J>,
  deps: HostDeps,
) {
  return class GameRoom extends Room<{ state: S }> {
    private sim!: Simulation<S, C, I, J>;
    private readonly limits = new Map<string, ClientLimits>();
    private counters = {
      ticks: 0,
      lateTicks: 0,
      tickMsTotal: 0,
      tickMsMax: 0,
      inputsApplied: 0,
      inputsRejected: 0,
      inputsDropped: 0,
      reconnects: 0,
    };
    private lastTickAt = 0;

    onCreate(): void {
      this.sim = new Simulation(game, deps.config, randomInt(0, 2 ** 31));
      this.maxClients = this.sim.config.maxPlayers;
      this.patchRate = Math.round(1000 / this.sim.config.patchRate);

      this.state = this.sim.state;
      this.state.code = deps.registry.register({
        roomId: this.roomId,
        isFull: () => this.clients.length >= this.maxClients,
        stats: () => this.stats(),
        replay: () => this.sim.toReplay(),
      });
      this.sim.start();

      this.onMessage(MESSAGES.input, (client, raw) => this.handleInput(client, raw));
      this.onMessage(MESSAGES.debug, (client, raw) => this.handleDebug(client, raw));
      this.clock.setInterval(() => this.tick(), 1000 / this.sim.config.tickRate);
      this.clock.setInterval(() => deps.logger.info("room stats", { ...this.stats() }), ROOM_STATS_LOG_SECONDS * 1000);

      deps.logger.info("room created", { roomId: this.roomId, code: this.state.code, seed: this.sim.seed });
    }

    onJoin(client: Client, options?: unknown): void {
      try {
        this.sim.join(client.sessionId, options);
      } catch (error) {
        if (error instanceof JoinRejectedError) {
          deps.logger.info("join rejected", { roomId: this.roomId, playerId: client.sessionId, reason: error.reason });
        }
        throw error;
      }
      this.limits.set(client.sessionId, { bucket: new TokenBucket(INPUTS_PER_SECOND), invalidInARow: 0 });
      deps.logger.info("player joined", this.fields(client));
    }

    onDrop(client: Client): void {
      this.sim.drop(client.sessionId);
      deps.logger.info("player dropped", this.fields(client));
      if (this.sim.config.reconnectSeconds > 0) {
        void this.allowReconnection(client, this.sim.config.reconnectSeconds);
      }
    }

    onReconnect(client: Client): void {
      this.sim.reconnect(client.sessionId);
      this.counters.reconnects += 1;
      deps.logger.info("player reconnected", this.fields(client));
    }

    onLeave(client: Client): void {
      this.sim.leave(client.sessionId);
      this.limits.delete(client.sessionId);
      deps.logger.info("player left", this.fields(client));
    }

    onDispose(): void {
      deps.registry.unregister(this.state.code);
      deps.replays.save(this.roomId, this.sim.toReplay());
      deps.logger.info("room disposed", { ...this.stats() });
    }

    private stats(): RoomStats {
      const { ticks, tickMsTotal } = this.counters;
      return {
        roomId: this.roomId,
        code: this.state.code,
        players: this.clients.length,
        tick: this.state.tick,
        ticks,
        lateTicks: this.counters.lateTicks,
        avgTickMs: ticks === 0 ? 0 : Math.round((tickMsTotal / ticks) * 1000) / 1000,
        maxTickMs: Math.round(this.counters.tickMsMax * 1000) / 1000,
        inputsApplied: this.counters.inputsApplied,
        inputsRejected: this.counters.inputsRejected,
        inputsDropped: this.counters.inputsDropped,
        reconnects: this.counters.reconnects,
      };
    }

    private handleInput(client: Client, raw: unknown): void {
      const limits = this.limits.get(client.sessionId);
      if (!limits) return client.leave(CloseCode.WITH_ERROR);
      if (!limits.bucket.take()) {
        this.counters.inputsDropped += 1;
        return;
      }
      const envelope = InputEnvelopeSchema.safeParse(raw);
      const result = envelope.success ? this.sim.input(client.sessionId, envelope.data.seq, envelope.data.input) : "invalid";
      if (result === "invalid") return this.rejectInput(client, limits);
      limits.invalidInARow = 0;
      if (result === "accepted") this.counters.inputsApplied += 1;
    }

    /** One bad input only gets a notice; a client that keeps sending them is removed. */
    private rejectInput(client: Client, limits: ClientLimits): void {
      this.counters.inputsRejected += 1;
      limits.invalidInARow += 1;
      deps.logger.warn("invalid input", { ...this.fields(client), inARow: limits.invalidInARow });
      if (limits.invalidInARow >= MAX_INVALID_INPUTS_IN_A_ROW) return client.leave(CloseCode.WITH_ERROR);
      client.send(MESSAGES.notice, { error: "invalid input" });
    }

    private handleDebug(client: Client, raw: unknown): void {
      if (!isDebugEnabled(deps.env)) return client.send(MESSAGES.notice, { error: "debug commands are disabled" });
      const command = DebugCommandSchema.safeParse(raw);
      if (!command.success || !this.sim.debug(client.sessionId, command.data.name, command.data.args)) {
        return client.send(MESSAGES.notice, { error: "unknown debug command" });
      }
    }

    private tick(): void {
      const started = performance.now();
      const interval = 1000 / this.sim.config.tickRate;
      if (this.lastTickAt > 0 && started - this.lastTickAt > interval * 1.5) this.counters.lateTicks += 1;
      this.lastTickAt = started;
      try {
        if (!this.sim.step()) return;
      } catch (error) {
        deps.logger.error("game step failed", {
          roomId: this.roomId,
          tick: this.state.tick,
          error: String(error),
          replay: ROUTES.replay(this.roomId),
        });
        this.broadcast(MESSAGES.notice, { error: "the game hit an error and the room is closing" });
        void this.disconnect(CloseCode.WITH_ERROR);
        return;
      }
      const took = performance.now() - started;
      this.counters.ticks += 1;
      this.counters.tickMsTotal += took;
      this.counters.tickMsMax = Math.max(this.counters.tickMsMax, took);
    }

    private fields(client: Client) {
      return { roomId: this.roomId, code: this.state.code, tick: this.state.tick, playerId: client.sessionId };
    }
  };
}
