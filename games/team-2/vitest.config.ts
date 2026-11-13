import { defineConfig } from "vitest/config";

// Colyseus loads @pm2/io, which calls process.send() and breaks vitest's default fork pool.
export default defineConfig({
	test: { pool: "threads" },
});
