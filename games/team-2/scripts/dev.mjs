import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const spawnOptions = {
	stdio: "inherit",
	shell: isWindows,
};
const children = [
	spawn(npm, ["run", "dev:server"], spawnOptions),
	spawn(npm, ["run", "dev:client"], spawnOptions),
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
process.on("SIGTERM", () => stop(0));\n
