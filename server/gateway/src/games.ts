import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The games in a monorepo's `games/` folder: every sub-folder whose package.json has a `server` script, sorted by name. */
export function discoverGames(gamesDir: string): string[] {
  if (!existsSync(gamesDir)) return [];
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      try {
        const manifest = JSON.parse(readFileSync(join(gamesDir, entry.name, "package.json"), "utf8")) as { scripts?: Record<string, string> };
        return typeof manifest.scripts?.server === "string";
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name)
    .sort();
}

/** One internal port per game, counting up from `base` in the order of the names. */
export function assignPorts(games: readonly string[], base: number): Record<string, number> {
  return Object.fromEntries(games.map((name, index) => [name, base + index]));
}
