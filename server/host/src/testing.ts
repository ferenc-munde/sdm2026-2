import { createServer } from "node:net";
import { startGameServer, type RunningGameServer, type StartGameServerOptions } from "./server";
import { createLogger, type Logger } from "./logger";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

export interface TestServer extends RunningGameServer {
  url: string;
  logs: Record<string, unknown>[];
}

/** Boots a game server on a free port and captures its log lines. */
export async function startTestServer(options: Omit<StartGameServerOptions, "port" | "logger">): Promise<TestServer> {
  const logs: Record<string, unknown>[] = [];
  const logger: Logger = createLogger(
    { env: options.env ?? "local", sha: "test", game: options.gameId },
    (line) => logs.push(JSON.parse(line)),
  );
  const port = await freePort();
  const running = await startGameServer({ ...options, port, logger });
  return { ...running, url: `http://localhost:${port}`, logs };
}
