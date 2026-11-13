import type { Phase } from "../shared/types.ts";

export const HOW_TO_PLAY = [
  "Work together to bring The Last Train to the station before the hull reaches zero.",
  "Move with WASD or the arrow keys. Hold Space or E to interact.",
  "Collect coal at the dispenser and deliver it to the engine to add 35 fuel (maximum 100).",
  "Hold a wrench near a breach and interact for 3 seconds. Letting go resets repair progress.",
  "Hold an extinguisher near a fire and interact for 2.5 seconds. Put out engine fires to get moving again.",
  "Watch hull, fuel and distance. Share jobs with the crew; tools are kept after repairs.",
] as const;
export const CONTROL_HINTS = "Move: WASD / arrows · Hold interact: Space / E";

/** Mount beside the lobby and keep it mounted during play. No game state is changed. */
export function createHelp(container: HTMLElement, beforeOpen: () => void = () => {}) {
  const open = document.createElement("button");
  open.type = "button"; open.textContent = "How to play";
  open.style.cssText = "position:fixed;right:16px;top:56px;z-index:12;padding:8px;border-radius:6px";
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "how-to-play-title");
  dialog.style.cssText = "max-width:540px;width:calc(100vw - 72px);max-height:80vh;overflow:auto;padding:24px;border-radius:12px;background:#17171f;color:#fff;border:1px solid #555";
  const title = document.createElement("h2"); title.id = "how-to-play-title"; title.textContent = "How to play";
  const list = document.createElement("ol");
  for (const text of HOW_TO_PLAY) { const item=document.createElement("li");item.textContent=text;item.style.marginBottom="12px";list.append(item); }
  const close = document.createElement("button");close.type="button";close.textContent="Back to game";
  const hints=document.createElement("p");hints.textContent=CONTROL_HINTS;
  hints.style.cssText="position:fixed;left:16px;bottom:16px;max-width:42vw;background:#101018dd;padding:8px;z-index:2;font:12px system-ui;color:white";
  // Stop game keyboard listeners while the modal has focus, including Space/E.
  dialog.addEventListener("keydown", event => event.stopPropagation());
  const onOpen=()=>{ beforeOpen(); dialog.showModal(); };const onClose=()=>dialog.close();
  const restore=()=>{ if (!open.hidden) open.focus(); };
  open.addEventListener("click",onOpen);close.addEventListener("click",onClose);dialog.addEventListener("close",restore);
  dialog.append(title,list,close);container.append(open,dialog,hints);
  return {
    update(phase: Phase) { hints.hidden=phase!=="playing"; open.hidden=phase==="won"||phase==="lost"; if (open.hidden && dialog.open) dialog.close(); },
    dispose() { open.remove();dialog.remove();hints.remove(); },
  };
}
