import type { Minigame, MinigameFactory } from "./types.ts";

const COLORS = ["#e46c63", "#62cdd3", "#e0bc4e", "#71a98d"];

/** Placeholder "connect the wires": click a left node, then its matching colour on the right. */
export const wires: MinigameFactory = (host, context) => {
  host.innerHTML = "";
  host.className = "ltm-body";

  const board = document.createElement("div");
  board.className = "ltm-wires";
  const status = document.createElement("p");
  status.className = "ltm-hint";
  status.textContent = "Connect every matching pair.";
  host.append(board, status);

  const buttons: HTMLButtonElement[] = [];
  const makeNode = (color: string, index: number, side: "left" | "right"): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ltm-node ltm-${side}`;
    button.style.setProperty("--node", color);
    button.dataset.index = String(index);
    buttons.push(button);
    return button;
  };

  const rights = COLORS.map((color, index) => ({ color, index })).sort(() => Math.random() - 0.5);
  for (const [index, color] of COLORS.entries()) makeNode(color, index, "left");
  for (const right of rights) makeNode(right.color, right.index, "right");
  board.append(...buttons);

  let selected: number | null = null;
  let matched = 0;

  board.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("ltm-node")) return;
    const index = Number(target.dataset.index);
    if (target.classList.contains("ltm-left")) {
      for (const button of buttons) button.classList.remove("ltm-picked");
      target.classList.add("ltm-picked");
      selected = index;
      return;
    }
    if (selected === null || target.classList.contains("ltm-matched")) return;
    if (selected === index) {
      target.classList.add("ltm-matched");
      for (const button of buttons) {
        if (button.classList.contains("ltm-picked")) button.classList.replace("ltm-picked", "ltm-matched");
      }
      selected = null;
      matched += 1;
      if (matched === COLORS.length) {
        status.textContent = "Panel wired.";
        board.style.pointerEvents = "none";
        context.done();
      }
    } else {
      selected = null;
      for (const button of buttons) button.classList.remove("ltm-picked");
    }
  });

  return {
    destroy() {
      host.innerHTML = "";
    },
  };
};
