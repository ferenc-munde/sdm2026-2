import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    minify: 'terser',
  },
import { defineConfig } from "vite";

export default defineConfig({
  server: { host: "0.0.0.0" },
});
