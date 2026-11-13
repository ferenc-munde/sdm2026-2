import { defineConfig } from "vite";

// Config for the client app only. `npm run dev` runs `vite client`, so Vite
// loads this file and serves `client/index.html`. Keeping it out of the package
// root also keeps `vitest` scanning the whole package (shared/ and client/).
export default defineConfig({
  server: { port: 5173, open: false },
  build: { outDir: "../dist", emptyOutDir: true },
});
