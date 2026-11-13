import { defineConfig } from "vitest/config";

// Colyseus loads @pm2/io, which calls process.send() and breaks vitest's default fork pool
// (the same setting as server/host/vitest.config.ts).
export default defineConfig({
  test: { pool: "threads" },
});
