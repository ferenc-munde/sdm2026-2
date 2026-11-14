import type { MinigameFactory } from "./types.ts";

const TILES = 9;
const LIT = 5;

/** Placeholder "switch panel": turn off every lit tile; a wrong tile relights everything. */
export const panel: MinigameFactory = (host, context) => {
  host.innerHTML = "";
  host.className = "ltm-body";

  const grid = document.createElement("div");
  grid.className = "ltm-grid";
  const status = document.createElement("p");
  status.className = "ltm-hint";
  host.append(grid, status);

  let remaining = LIT;
  const lit = new Set<number>();
  while (lit.size < LIT) lit.add(Math.floor(Math.random() * TILES));
  status.textContent = `${LIT} tiles are lit — switch them off.`;

  const tiles: HTMLButtonElement[] = [];
  for (let index = 0; index < TILES; index++) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = lit.has(index) ? "ltm-tile ltm-on" : "ltm-tile";
    tile.addEventListener("click", () => {
      if (lit.has(index)) {
        lit.delete(index);
        tile.classList.remove("ltm-on");
        remaining -= 1;
        status.textContent = remaining === 0 ? "Panel cleared." : `${remaining} tiles are lit.`;
        if (remaining === 0) {
          grid.style.pointerEvents = "none";
          context.done();
        }
      } else {
        remaining = LIT;
        lit.clear();
        while (lit.size < LIT) lit.add(Math.floor(Math.random() * TILES));
        for (const [i, other] of tiles.entries()) other.classList.toggle("ltm-on", lit.has(i));
        status.textContent = "Missed — panel reset.";
      }
    });
    tiles.push(tile);
    grid.append(tile);
  }

  return {
    destroy() {
      host.innerHTML = "";
    },
  };
};
