import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assignPorts, discoverGames, supervise, type Supervised } from "../src";

const running: Supervised[] = [];
const folders: string[] = [];

afterEach(async () => {
  for (const process_ of running.splice(0)) await process_.stop();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function waitFor(check: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const node = (code: string) => ({ name: "test", command: process.execPath, args: ["-e", code] });

describe("supervise", () => {
  it("starts the process again after it exits", async () => {
    const logs: Record<string, unknown>[] = [];
    const process_ = supervise(node("process.exit(3)"), { restartDelayMs: 20, maxDelayMs: 40, log: (f) => logs.push(f) });
    running.push(process_);
    await waitFor(() => process_.starts >= 3);
    expect(logs.some((line) => line.message === "process exited, restarting" && line.code === 3)).toBe(true);
  });

  it("passes the environment to the process", async () => {
    const folder = mkdtempSync(join(tmpdir(), "sdm-supervise-"));
    folders.push(folder);
    const file = join(folder, "out.txt");
    const process_ = supervise(
      { name: "env", command: process.execPath, args: ["-e", `require('fs').writeFileSync(${JSON.stringify(file)}, process.env.PORT + ':' + process.env.GAME_NAME); setInterval(()=>{},1000)`], env: { PORT: "8123", GAME_NAME: "team-9" } },
      { restartDelayMs: 20 },
    );
    running.push(process_);
    await waitFor(() => {
      try {
        return require("node:fs").readFileSync(file, "utf8") === "8123:team-9";
      } catch {
        return false;
      }
    });
  });

  it("stops the process and does not start it again", async () => {
    const process_ = supervise(node("setInterval(() => {}, 1000)"), { restartDelayMs: 20 });
    running.push(process_);
    await waitFor(() => process_.starts === 1);
    await process_.stop();
    await new Promise((r) => setTimeout(r, 150));
    expect(process_.starts).toBe(1);
  });

  it("kills a process that ignores the stop signal", async () => {
    const process_ = supervise(node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"), { stopTimeoutMs: 200, restartDelayMs: 20 });
    running.push(process_);
    await new Promise((r) => setTimeout(r, 300));
    const before = Date.now();
    await process_.stop();
    expect(Date.now() - before).toBeLessThan(3000);
  });
});

describe("games in a monorepo", () => {
  function monorepo(games: Record<string, object | string>) {
    const folder = mkdtempSync(join(tmpdir(), "sdm-games-"));
    folders.push(folder);
    for (const [name, manifest] of Object.entries(games)) {
      mkdirSync(join(folder, name), { recursive: true });
      writeFileSync(join(folder, name, "package.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
    }
    return folder;
  }

  it("finds the games that have a server script, sorted by name", () => {
    const dir = monorepo({
      "team-3": { scripts: { server: "vite-node server.ts" } },
      "team-1": { scripts: { server: "vite-node server.ts", build: "vite build" } },
      "team-2": { scripts: { build: "vite build" } },
      "team-4": "not json",
    });
    expect(discoverGames(dir)).toEqual(["team-1", "team-3"]);
  });

  it("finds nothing in a folder that does not exist", () => {
    expect(discoverGames(join(tmpdir(), "sdm-no-such-folder"))).toEqual([]);
  });

  it("gives every game its own port, counting up", () => {
    expect(assignPorts(["team-1", "team-2", "team-3"], 8101)).toEqual({ "team-1": 8101, "team-2": 8102, "team-3": 8103 });
  });
});
