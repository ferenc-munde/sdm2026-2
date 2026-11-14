import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineRoom, defineServer, Room, type Server } from "colyseus";
import express from "express";
import {
  BugReportSchema,
  JoinRoomRequestSchema,
  ROUTES,
  parseAppEnv,
  type AppEnv,
  type HealthResponse,
  type Replay,
} from "@sdm/core/shared";
import { createLogger, type Logger } from "./logger";
import { RoomRegistry } from "./registry";
import { BugReportStore, RateLimiter, ReplayStore } from "./replays";
import type { HostDeps } from "./room";
import { ProcessMonitor } from "./stats";

export const GAME_ROOM_NAME = "game";

/** Bug reports per client address and minute. */
export const BUG_REPORTS_PER_MINUTE = 5;
/** How often the process writes its stats line to the log. */
export const PROCESS_STATS_LOG_SECONDS = 30;

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
  /**
   * Folder with the game's built client (`index.html` and assets), served from the same origin.
   * Defaults to `$CLIENT_DIR`, then `./dist` or `./client/dist`, whichever holds an `index.html`.
   */
  clientDir?: string;
}

export interface RunningGameServer {
  server: Server;
  port: number;
  env: AppEnv;
  shutdown(): Promise<void>;
}

/** Where a game's Vite build usually lands, relative to the game's folder: the root or the client folder. */
export const DEFAULT_CLIENT_DIRS = ["dist", "client/dist"];

/**
 * The folder to serve: the configured one (`clientDir` option, then `$CLIENT_DIR`) when there is one,
 * otherwise the first default folder that holds an `index.html`.
 */
export function findClientDir(
  option: string | undefined,
  env: string | undefined = process.env.CLIENT_DIR,
  base: string = process.cwd(),
): string | undefined {
  const configured = option ?? env;
  const candidates = configured ? [configured] : DEFAULT_CLIENT_DIRS;
  return candidates.map((dir) => resolve(base, dir)).find((dir) => existsSync(join(dir, "index.html")));
}

export async function startGameServer(options: StartGameServerOptions): Promise<RunningGameServer> {
  const env = options.env ?? parseAppEnv(process.env.APP_ENV);
  const sha = options.sha ?? process.env.COMMIT_SHA ?? "unknown";
  const port = options.port ?? Number(process.env.PORT ?? 2567);
  const logger = options.logger ?? createLogger({ env, sha, game: options.gameId });
  const startedAt = new Date().toISOString();
  const registry = new RoomRegistry();
  const replays = new ReplayStore();
  const bugReports = new BugReportStore();
  const bugReportLimit = new RateLimiter(BUG_REPORTS_PER_MINUTE, 60_000);
  const monitor = new ProcessMonitor(registry);
  const deps: HostDeps = { env, sha, gameId: options.gameId, logger, registry, replays, config: options.config };
  const clientDir = findClientDir(options.clientDir);

  /** A live room's replay so far, or the replay of a room that already closed. */
  const findReplay = (roomId: string): Replay | undefined => registry.byRoomId(roomId)?.replay() ?? replays.get(roomId);

  const rooms = Object.fromEntries(
    Object.entries(options.rooms).map(([name, factory]) => [name, defineRoom(factory(deps))]),
  );

  const server = defineServer({
    rooms,
    greet: false,
    express: (app) => {
      // Behind Railway's proxy: take the client address from X-Forwarded-For, for the bug report rate limit.
      app.set("trust proxy", 1);
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

      app.get(ROUTES.replay(":roomId"), (req, res) => {
        const replay = findReplay(String(req.params.roomId));
        if (!replay) return void res.status(404).json({ error: "unknown room" });
        res.json(replay);
      });

      app.post(ROUTES.bugReports, (req, res) => {
        const body = BugReportSchema.safeParse(req.body);
        if (!body.success) return void res.status(400).json({ error: "invalid bug report" });
        if (!bugReportLimit.allow(req.ip ?? "unknown")) {
          return void res.status(429).json({ error: "too many bug reports, try again in a minute" });
        }
        const replay = body.data.roomId ? findReplay(body.data.roomId) : undefined;
        const stored = bugReports.add(body.data, replay);
        logger.info("bug report", { id: stored.id, roomId: body.data.roomId, hasReplay: Boolean(replay) });
        res.status(201).json({ id: stored.id });
      });

      app.get(`${ROUTES.bugReports}/:id`, (req, res) => {
        const report = bugReports.get(String(req.params.id));
        if (!report) return void res.status(404).json({ error: "unknown bug report" });
        res.json(report);
      });

      app.get(ROUTES.stats, (_req, res) => {
        res.json(monitor.snapshot());
      });

      if (clientDir) app.use(express.static(clientDir));
    },
  });

  await server.listen(port);
  logger.info("server listening", { port, clientDir: clientDir ?? null });

  const processLog = setInterval(() => {
    const { process: stats } = monitor.snapshot();
    logger.info("process stats", { ...stats });
    monitor.reset();
  }, PROCESS_STATS_LOG_SECONDS * 1000);
  processLog.unref();

  return {
    server,
    port,
    env,
    shutdown: async () => {
      clearInterval(processLog);
      monitor.stop();
      await server.gracefullyShutdown(false);
    },
  };
}
