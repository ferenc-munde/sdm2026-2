import type { AnnouncementEvent } from "./conductorModel.ts";

export type AnnouncementService = (event: AnnouncementEvent, signal: AbortSignal) => Promise<string>;

/** Optional same-origin server proxy. API credentials belong on that server. */
export function createAnnouncementService(endpoint: string): AnnouncementService {
  const url = new URL(endpoint, window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Use a same-origin conductor proxy");
  return async (event, signal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal,
    });
    if (!response.ok) throw new Error("Conductor service unavailable");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("text" in value) ||
        typeof value.text !== "string" || !value.text.trim() || value.text.length > 240) {
      throw new Error("Invalid conductor response");
    }
    return value.text.trim();
  };
}
