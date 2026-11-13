// Win and lose screens with "play again" (#21).
//
// `endScreenFor` is pure and tested; `createEndScreen` is the small DOM wrapper
// the page uses. The screen follows `GameState.phase`, and "play again" is the
// `playAgain` message from the shared contract — the room transport plugs in
// with #12, where the socket lives.

import type { Phase } from "../shared/types.ts";

/** What an end screen says. */
export interface EndScreenView {
  /** Which ending this is; also written to `data-outcome` for styling. */
  outcome: "won" | "lost";
  title: string;
  detail: string;
  /** Label of the button that starts the next run. */
  action: string;
}

/** The end screen for a phase, or `null` while the run is still going. */
export function endScreenFor(phase: Phase): EndScreenView | null {
  if (phase === "won") {
    return {
      outcome: "won",
      title: "You made it",
      detail: "The Last Train reached the station with the crew aboard.",
      action: "Play again",
    };
  }
  if (phase === "lost") {
    return {
      outcome: "lost",
      title: "The train is lost",
      detail: "The hull gave in before the station. The line wins this one.",
      action: "Play again",
    };
  }
  return null;
}

export interface EndScreenOptions {
  /** Called when the player presses "Play again". */
  onPlayAgain: () => void;
}

export interface EndScreen {
  /** Shows the screen for `won` / `lost` and hides it otherwise. */
  update(phase: Phase): void;
}

/** Creates the overlay once and shows or hides it as the phase changes. */
export function createEndScreen(container: HTMLElement, options: EndScreenOptions): EndScreen {
  const root = document.createElement("div");
  root.className = "endscreen";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "endscreen-panel";

  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const action = document.createElement("button");
  action.type = "button";
  action.className = "endscreen-action";
  action.addEventListener("click", () => options.onPlayAgain());

  panel.append(title, detail, action);
  root.append(panel);
  container.append(root);

  return {
    update(phase: Phase): void {
      const view = endScreenFor(phase);
      if (!view) {
        root.hidden = true;
        delete root.dataset.outcome;
        return;
      }
      title.textContent = view.title;
      detail.textContent = view.detail;
      action.textContent = view.action;
      root.dataset.outcome = view.outcome;
      root.hidden = false;
    },
  };
}
