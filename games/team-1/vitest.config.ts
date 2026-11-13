import { defineConfig } from "vitest/config";

// Colyseus loads @pm2/io, which calls process.send() and breaks vitest's default fork pool
// (the same setting as server/host/vitest.config.ts).
// Only the *.test.ts files run here; tests/*.test.mjs are plain Node scripts (see package.json).
export default defineConfig({
  test: {
    pool: "threads",
    include: ["shared/**/*.test.ts", "room/**/*.test.ts", "client/**/*.test.ts"],
  },
});
