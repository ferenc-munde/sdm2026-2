import { randomInt } from "node:crypto";
import { CloseCode, Room, type Client } from "colyseus";
import {
  DebugCommandSchema,
  InputEnvelopeSchema,
  MESSAGES,
  SeededRandom,
  isDebugEnabled,
  type AppEnv,
} from "@sdm/core/shared";
import {
  Seat,
  type BaseState,
  type GameContext,
  type GameDefinition,
  type PlayerInput,
  type RoomSettings,
} from "@sdm/core/sim";
import type { Logger } from "./logger";
import type { RoomRegistry } from "./registry";

export interface HostDeps {
  env: AppEnv;
  sha: string;
  gameId: string;
  logger: Logger;
  registry: RoomRegistry;
  /** Raw contents of the game's config/game.json, validated by the game's config schema. */
  config: unknown;
}

export function createGameRoom<S extends BaseState, C extends RoomSettings, I, J = unknown>(
  game: GameDefinition<S, C, I, J>,
  deps: HostDeps,
) {
  return class GameRoom extends Room<{ state: S }> {
    private config!: C;
    private ctx!: GameContext<C>;
    private pending: PlayerInput<I>[] = [];

    onCreate(): void {
      this.config = game.configSchema.parse(deps.config);
      this.ctx = { random: new SeededRandom(randomInt(0, 2 ** 31)), config: this.config };
      this.maxClients = this.config.maxPlayers;
      this.patchRate = Math.round(1000 / this.config.patchRate);

      this.state = game.createState(this.config);
      this.state.code = deps.registry.register({
        roomId: this.roomId,
        isFull: () => this.clients.length >= this.maxClients,
      });
      game.init(this.state, this.ctx);

      this.onMessage(MESSAGES.input, (client, raw) => this.handleInput(client, raw));
      this.onMessage(MESSAGES.debug, (client, raw) => this.handleDebug(client, raw));
      this.clock.setInterval(() => this.tick(), 1000 / this.config.tickRate);

      deps.logger.info("room created", { roomId: this.roomId, code: this.state.code });
    }

    onJoin(client: Client, options?: unknown): void {
      // Checked before the seat exists, so a rejected join leaves no trace in the state.
      const joinOptions = this.parseJoinOptions(client, options);
      const seat = new Seat();
      seat.playerId = client.sessionId;
      this.state.seats.set(client.sessionId, seat);
      game.join(this.state, client.sessionId, this.ctx, joinOptions);
      deps.logger.info("player joined", this.fields(client));
    }

    onDrop(client: Client): void {
      const seat = this.state.seats.get(client.sessionId);
      if (seat) seat.connected = false;
      game.disconnect?.(this.state, client.sessionId, this.ctx);
      if (this.config.reconnectSeconds > 0) {
        void this.allowReconnection(client, this.config.reconnectSeconds);
      }
    }

    onReconnect(client: Client): void {
      const seat = this.state.seats.get(client.sessionId);
      if (seat) seat.connected = true;
      game.reconnect?.(this.state, client.sessionId, this.ctx);
    }

    onLeave(client: Client): void {
      game.leave(this.state, client.sessionId, this.ctx);
      this.state.seats.delete(client.sessionId);
      deps.logger.info("player left", this.fields(client));
    }

    onDispose(): void {
      deps.registry.unregister(this.state.code);
      deps.logger.info("room disposed", { roomId: this.roomId });
    }

    private parseJoinOptions(client: Client, options: unknown): J {
      if (!game.joinOptionsSchema) return undefined as J;
      const parsed = game.joinOptionsSchema.safeParse(options ?? {});
      if (parsed.success) return parsed.data;
      const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
      deps.logger.info("join rejected", { roomId: this.roomId, playerId: client.sessionId, reason });
      throw new Error(`can't join: ${reason}`);
    }

    private handleInput(client: Client, raw: unknown): void {
      const envelope = InputEnvelopeSchema.safeParse(raw);
      const seat = this.state.seats.get(client.sessionId);
      if (!envelope.success || !seat) return client.leave(CloseCode.WITH_ERROR);
      if (envelope.data.seq <= seat.lastSeq) return;
      const input = game.inputSchema.safeParse(envelope.data.input);
      if (!input.success) return client.leave(CloseCode.WITH_ERROR);
      seat.lastSeq = envelope.data.seq;
      this.pending.push({ playerId: client.sessionId, input: input.data });
    }

    private handleDebug(client: Client, raw: unknown): void {
      if (!isDebugEnabled(deps.env)) return client.send(MESSAGES.notice, { error: "debug commands are disabled" });
      const command = DebugCommandSchema.safeParse(raw);
      const run = command.success ? game.commands?.[command.data.name] : undefined;
      if (!command.success || !run) return client.send(MESSAGES.notice, { error: "unknown debug command" });
      run(this.state, command.data.args, this.ctx);
    }

    private tick(): void {
      if (this.state.paused) return;
      const inputs = this.pending;
      this.pending = [];
      try {
        this.state.tick += 1;
        game.step(this.state, inputs, this.ctx);
      } catch (error) {
        deps.logger.error("game step failed", { roomId: this.roomId, tick: this.state.tick, error: String(error) });
        this.broadcast(MESSAGES.notice, { error: "the game hit an error and the room is closing" });
        void this.disconnect(CloseCode.WITH_ERROR);
      }
    }

    private fields(client: Client) {
      return { roomId: this.roomId, code: this.state.code, tick: this.state.tick, playerId: client.sessionId };
    }
  };
}
