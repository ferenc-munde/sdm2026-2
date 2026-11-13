import type { AppEnv } from "@sdm/core/shared";

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

interface LoggerBase {
  env: AppEnv;
  sha: string;
  game: string;
}

/** One JSON object per line; every line carries env, sha and game so Railway can filter on them. */
export function createLogger(base: LoggerBase, write: (line: string) => void = (l) => console.log(l)): Logger {
  const emit = (level: string, message: string, fields: Record<string, unknown> = {}) =>
    write(JSON.stringify({ level, message, ...base, ...fields }));
  return {
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}
