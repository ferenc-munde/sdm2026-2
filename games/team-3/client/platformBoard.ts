import type { GameState } from "../shared/types.ts";
import { isNearPlatformBoard, PLATFORM_GUIDE, type PlatformObjectLayout } from "../shared/stations/platform.ts";

/** Mount with the waiting platform; proximity shows instructions without stealing focus. */
export function createPlatformBoard(container: HTMLElement) {
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Platform how-to-play board");
  panel.style.cssText = "position:fixed;right:16px;top:80px;max-width:min(380px,80vw);" +
    "padding:16px;background:#171d29;color:white;border:1px solid #a99a68;border-radius:8px;" +
    "font:14px system-ui;z-index:15";
  const heading = document.createElement("h2");
  heading.textContent = "How to play";
  const list = document.createElement("ul");
  for (const instruction of PLATFORM_GUIDE) {
    const item = document.createElement("li");
    item.textContent = instruction;
    list.append(item);
  }
  panel.append(heading, list);
  panel.hidden = true;
  container.append(panel);
  return {
    update(lobby: GameState, playerId: string, layout: PlatformObjectLayout): void {
      panel.hidden = !isNearPlatformBoard(lobby, playerId, layout);
    },
    dispose(): void { panel.remove(); },
  };
}
