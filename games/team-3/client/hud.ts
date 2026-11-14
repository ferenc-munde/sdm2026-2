// The heads-up display: hull, fuel and distance bars at the top of the screen (#20).
//
// It reads the view built by `hudModel.ts` and writes it into the page. The bar
// elements are created once and only their width and colour change, so nothing
// is rebuilt on every state update.

import { BAR_COLORS, type HudView } from "./hudModel.ts";

export interface HudBars {
  root: HTMLElement;
  update(view: HudView): void;
}

interface Bar {
  track: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

function createBar(root: HTMLElement, label: string): Bar {
  const bar = document.createElement("div");
  bar.className = "hud-bar";
  bar.dataset.bar = label.toLowerCase();

  const title = document.createElement("span");
  title.className = "hud-bar-label";
  title.textContent = label;

  const track = document.createElement("div");
  track.className = "hud-bar-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", label);

  const fill = document.createElement("div");
  fill.className = "hud-bar-fill";
  track.append(fill);

  const value = document.createElement("span");
  value.className = "hud-bar-value";

  bar.append(title, track, value);
  root.append(bar);
  return { track, fill, value };
}

/** Creates the three bars inside `container`. */
export function createHudBars(container: HTMLElement): HudBars {
  const root = document.createElement("div");
  root.className = "hud";
  container.append(root);

  const hull = createBar(root, "Hull");
  const fuel = createBar(root, "Fuel");
  const distance = createBar(root, "Distance");

  // What is draining the hull, next to its value (#421); hidden when nothing is.
  const drain = document.createElement("span");
  drain.className = "hud-bar-drain";
  drain.hidden = true;
  hull.value.after(drain);

  return {
    root,
    update(view: HudView): void {
      hull.fill.style.width = `${view.hullWidth * 100}%`;
      hull.fill.style.background = BAR_COLORS.hull;
      hull.value.textContent = `${view.hull}`;
      drain.textContent = view.hullDrain > 0 ? `-${view.hullDrain.toFixed(1)}/s` : "";
      drain.hidden = view.hullDrain <= 0;
      root.classList.toggle("is-hull-critical", view.hullCritical);
      hull.track.setAttribute("aria-valuenow", `${view.hull}`);
      hull.track.setAttribute(
        "aria-valuetext",
        view.hullDrain > 0 ? `${view.hull}, losing ${view.hullDrain.toFixed(1)} per second` : `${view.hull}`,
      );

      fuel.fill.style.width = `${view.fuelWidth * 100}%`;
      fuel.fill.style.background = view.fuelColor;
      fuel.value.textContent = `${view.fuel}`;
      fuel.fill.dataset.low = String(view.lowFuel);
      fuel.track.setAttribute("aria-valuenow", `${view.fuel}`);

      distance.fill.style.width = `${view.distanceWidth * 100}%`;
      distance.fill.style.background = BAR_COLORS.distance;
      distance.value.textContent = view.distanceText;
      distance.track.setAttribute("aria-valuenow", `${view.distance}`);
    },
  };
}
