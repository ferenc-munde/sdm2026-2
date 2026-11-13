import { z } from "zod";

/**
 * Where a build is running. Railway sets APP_ENV per environment; PR environments
 * inherit "development". "local" is a laptop running `pnpm dev`.
 */
export const APP_ENVS = ["local", "development", "staging", "production"] as const;
export const AppEnvSchema = z.enum(APP_ENVS);
export type AppEnv = z.infer<typeof AppEnvSchema>;

/** Debug commands, the state inspector and test hooks are on everywhere except production. */
export function isDebugEnabled(env: AppEnv): boolean {
  return env !== "production";
}

/** Response of `GET /health`. Scripts (`env:wait`, `env:status`) and smoke tests read this. */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  env: AppEnvSchema,
  /** Git commit SHA of the running build ("dev" when unknown). */
  sha: z.string(),
  /** ISO timestamp of when this server process started. */
  startedAt: z.string(),
  /** Game ids this server hosts, e.g. ["sample"]. */
  games: z.array(z.string()),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
