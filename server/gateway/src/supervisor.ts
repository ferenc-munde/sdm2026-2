import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessSpec {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface SupervisorOptions {
  /** Wait before the first restart, then doubled up to `maxDelayMs`. */
  restartDelayMs?: number;
  maxDelayMs?: number;
  /** A process that ran this long counts as healthy: its next restart starts from the first delay again. */
  healthyAfterMs?: number;
  /** How long a stopped process gets to exit before it is killed. */
  stopTimeoutMs?: number;
  log?: (fields: Record<string, unknown>) => void;
}

export interface Supervised {
  /** How many times the process was started, the first start included. */
  readonly starts: number;
  stop(): Promise<void>;
}

/**
 * Runs a process and starts it again when it exits, with a growing delay. The process leads its own
 * process group, so stopping it also stops what it started (pnpm, vite-node, the game server).
 */
export function supervise(spec: ProcessSpec, options: SupervisorOptions = {}): Supervised {
  const firstDelay = options.restartDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const healthyAfter = options.healthyAfterMs ?? 60_000;
  const stopTimeout = options.stopTimeoutMs ?? 5000;
  const log = options.log ?? (() => undefined);

  let child: ChildProcess | undefined;
  let starts = 0;
  let delay = firstDelay;
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    starts += 1;
    const startedAt = Date.now();
    const current = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: "inherit",
      detached: true,
    });
    child = current;
    log({ level: "info", message: "process started", process: spec.name, pid: current.pid, starts });
    current.on("error", (error) => log({ level: "error", message: "process failed to start", process: spec.name, error: String(error) }));
    current.on("exit", (code, signal) => {
      if (child === current) child = undefined;
      if (stopping) return;
      if (Date.now() - startedAt >= healthyAfter) delay = firstDelay;
      log({ level: "warn", message: "process exited, restarting", process: spec.name, code, signal, restartInMs: delay });
      timer = setTimeout(start, delay);
      delay = Math.min(delay * 2, maxDelay);
    });
  };

  const signalGroup = (signal: NodeJS.Signals) => {
    if (child?.pid === undefined) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* already gone */
    }
  };

  start();

  return {
    get starts() {
      return starts;
    },
    stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      const running = child;
      if (!running) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const killer = setTimeout(() => signalGroup("SIGKILL"), stopTimeout);
        running.once("exit", () => {
          clearTimeout(killer);
          resolve();
        });
        signalGroup("SIGTERM");
      });
    },
  };
}
