import type { MinigameFactory } from "./types.ts";

const CRANKS_NEEDED = 12;

/** Placeholder "crank it": press the crank until the bar is full. */
export const crank: MinigameFactory = (host, context) => {
  host.innerHTML = "";
  host.className = "ltm-body";

  const bar = document.createElement("div");
  bar.className = "ltm-bar";
  const fill = document.createElement("div");
  fill.className = "ltm-bar-fill";
  fill.style.width = "0%";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ltm-crank";
  button.textContent = "CRANK";
  const status = document.createElement("p");
  status.className = "ltm-hint";
  status.textContent = `${CRANKS_NEEDED} cranks to go.`;
  bar.append(fill);
  host.append(bar, button, status);

  let cranks = 0;
  button.addEventListener("click", () => {
    cranks += 1;
    fill.style.width = `${Math.min(100, (cranks / CRANKS_NEEDED) * 100)}%`;
    status.textContent = `${Math.max(0, CRANKS_NEEDED - cranks)} cranks to go.`;
    if (cranks >= CRANKS_NEEDED) {
      status.textContent = "Cranked all the way.";
      button.disabled = true;
      context.done();
    }
  });

  return {
    destroy() {
      host.innerHTML = "";
    },
  };
};
