// Starts the game server and the Vite client together: `pnpm run dev`.
// Plain Node so it runs on every OS. Stops both when one exits or on Ctrl+C.
import { spawn } from "node:child_process";

// `pnpm run` puts node_modules/.bin on PATH, so the shell finds both commands.
const commands = ["vite-node server.ts", "vite"];
const children = commands.map((command) => spawn(command, { stdio: "inherit", shell: true }));
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    // On Windows the child is a shell; taskkill /T also ends the process it started.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500).unref();
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Could not start a local service:", error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
