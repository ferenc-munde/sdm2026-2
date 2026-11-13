// `pnpm dev`: the game server (platform host, port 2567) and the Vite client (port 5173) together.
// The two tools are started with node directly, so this works the same under pnpm and npm and on
// every OS, and stopping this script stops both.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/** Path of the script a package runs as its command-line tool. */
function bin(packageName, binName = packageName) {
	const manifestPath = require.resolve(`${packageName}/package.json`);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin[binName];
	return resolve(dirname(manifestPath), entry);
}

const children = [
	spawn(process.execPath, [bin("vite-node"), "server.ts"], { stdio: "inherit" }),
	spawn(process.execPath, [bin("vite"), "client", "--host", "127.0.0.1"], { stdio: "inherit" }),
];
let stopping = false;

function stop(code = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) {
		if (child.exitCode === null) child.kill("SIGTERM");
	}
	setTimeout(() => process.exit(code), 250).unref();
}

for (const child of children) {
	child.on("error", (error) => {
		console.error("Could not start the local game service:", error.message);
		stop(1);
	});
	child.on("exit", (code) => {
		if (!stopping) stop(code ?? 1);
	});
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
