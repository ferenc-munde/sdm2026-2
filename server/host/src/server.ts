import { defineRoom, defineServer, Room, type Server } from "colyseus";
import express from "express";
import {
  GAME_ROOM_NAME,
  JoinRoomRequestSchema,
  ROUTES,
  parseAppEnv,
  type AppEnv,
  type HealthResponse,
} from "@sdm/core/shared";
import { createLogger, type Logger } from "./logger";
import { RoomRegistry } from "./registry";
import type { HostDeps } from "./room";

export { GAME_ROOM_NAME };

type RoomFactory = (deps: HostDeps) => new () => Room<any>;

export interface StartGameServerOptions {
  gameId: string;
  /** Contents of the game's config/game.json. */
  config: unknown;
  /** Room factories, for example `{ game: (deps) => createGameRoom(myGame, deps) }`. */
  rooms: Record<string, RoomFactory>;
  port?: number;
  env?: AppEnv;
  sha?: string;
  logger?: Logger;
}

export interface RunningGameServer {
  server: Server;
  port: number;
  env: AppEnv;
  shutdown(): Promise<void>;
}

export async function startGameServer(options: StartGameServerOptions): Promise<RunningGameServer> {
  const env = options.env ?? parseAppEnv(process.env.APP_ENV);
  const sha = options.sha ?? process.env.COMMIT_SHA ?? "unknown";
  const port = options.port ?? Number(process.env.PORT ?? 2567);
  const logger = options.logger ?? createLogger({ env, sha, game: options.gameId });
  const startedAt = new Date().toISOString();
  const registry = new RoomRegistry();
  const deps: HostDeps = { env, sha, gameId: options.gameId, logger, registry, config: options.config };

  const rooms = Object.fromEntries(
    Object.entries(options.rooms).map(([name, factory]) => [name, defineRoom(factory(deps))]),
  );

  const server = defineServer({
    rooms,
    greet: false,
    express: (app) => {
      app.use(express.json({ limit: "10kb" }));

      app.get(ROUTES.health, (_req, res) => {
        const body: HealthResponse = { ok: true, env, sha, startedAt };
        res.json(body);
      });

      app.post(ROUTES.joinRoom, (req, res) => {
        const body = JoinRoomRequestSchema.safeParse(req.body);
        const room = body.success ? registry.get(body.data.code) : undefined;
        if (!room) return void res.status(404).json({ error: "unknown room code" });
        if (room.isFull()) return void res.status(409).json({ error: "room is full" });
        res.json({ roomId: room.roomId });
      });
    },
  });

  await server.listen(port);
  logger.info("server listening", { port });

  return { server, port, env, shutdown: () => server.gracefullyShutdown(false) };
}
