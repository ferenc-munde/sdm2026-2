export const APP_ENVS = ["local", "development", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export interface HealthResponse {
  ok: true;
  env: AppEnv;
  sha: string;
  startedAt: string;
}

export function parseAppEnv(value: string | undefined): AppEnv {
  return (APP_ENVS as readonly string[]).includes(value ?? "") ? (value as AppEnv) : "local";
}

export function isDebugEnabled(env: AppEnv): boolean {
  return env !== "production";
}
