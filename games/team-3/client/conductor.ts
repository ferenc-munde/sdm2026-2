import type { GameState } from "../shared/types.ts";
import { announcementEvents, fallbackAnnouncement } from "./conductorModel.ts";
import type { AnnouncementService } from "./conductorService.ts";

/** Call update for every authoritative room patch; this never delays gameplay. */
export function createConductor(container: HTMLElement, service?: AnnouncementService) {
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Conductor announcements");
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  panel.style.cssText = "position:fixed;top:96px;left:50%;transform:translateX(-50%);" +
    "max-width:min(520px,80vw);padding:10px 16px;border-radius:8px;background:#181c28;" +
    "color:#fff;font:14px system-ui;pointer-events:none";
  panel.hidden = true;
  container.append(panel);
  let previous: GameState | null = null;
  let generation = 0;
  let active: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    generation++;
    active?.abort();
    clearTimeout(timeout);
    clearTimeout(expiry);
  };
  return {
    update(state: GameState): void {
      const events = announcementEvents(previous, state);
      previous = state;
      if (state.phase !== "playing") {
        cancel();
        panel.hidden = true;
        return;
      }
      if (!events.length) return;
      cancel();
      const version = generation;
      // Always show all immediate warnings; AI is optional wording for one event.
      panel.textContent = events.map(fallbackAnnouncement).join(" ");
      panel.hidden = false;
      expiry = setTimeout(() => { cancel(); panel.hidden = true; }, 8000);
      if (!service || events.length !== 1) return;
      const event = events[0]!;
      const controller = new AbortController();
      active = controller;
      timeout = setTimeout(() => controller.abort(), 2000);
      // Defer even a synchronous provider exception away from the game loop.
      void Promise.resolve().then(() => service(event, controller.signal)).then((text) => {
        if (generation === version && !controller.signal.aborted &&
            typeof text === "string" && text.trim() && text.length <= 240) {
          panel.textContent = text.trim(); // Never interpret generated text as HTML.
        }
      }).catch(() => { /* The immediate fallback remains visible. */ }).finally(() => {
        if (generation === version) clearTimeout(timeout);
      });
    },
    dispose(): void { cancel(); panel.remove(); },
  };
}
