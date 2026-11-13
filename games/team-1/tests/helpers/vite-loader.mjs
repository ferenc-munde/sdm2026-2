import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const configFile = fileURLToPath(new URL("../../vite.config.ts", import.meta.url));

export function createTestViteServer() {
  return createServer({
    root,
    configFile,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true },
  });
}
