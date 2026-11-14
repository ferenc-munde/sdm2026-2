// Standalone preview only; does not replace the Vite game or multiplayer server.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/hud-preview');
mkdirSync(output, { recursive: true });
execFileSync(process.execPath, [
  path.join(root, 'node_modules/typescript/bin/tsc'),
  path.join(root, 'client/hud.ts'), '--target', 'ES2022', '--module', 'ESNext',
  '--strict', '--skipLibCheck', '--outDir', output,
], { stdio: 'inherit' });
for (const name of ['hud-preview.html', 'hud.css']) {
  copyFileSync(path.join(root, 'client', name), path.join(output, name));
}
const routes = {
  '/': ['hud-preview.html', 'text/html; charset=utf-8'],
  '/hud.js': ['hud.js', 'text/javascript; charset=utf-8'],
  '/journey-view': ['journey-view.js', 'text/javascript; charset=utf-8'],
  '/journey-view.js': ['journey-view.js', 'text/javascript; charset=utf-8'],
  '/hud.css': ['hud.css', 'text/css; charset=utf-8'],
};
const server = createServer((request, response) => {
  const route = routes[request.url];
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': route[1] });
  response.end(readFileSync(path.join(output, route[0])));
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(5174, '127.0.0.1', () => console.log('Task panel: http://127.0.0.1:5174 — Ctrl+C to stop'));
