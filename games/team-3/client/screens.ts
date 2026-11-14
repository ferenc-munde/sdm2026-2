// Win and lose screens with "play again" (#21).
//
// `endScreenFor` is pure and tested; `createEndScreen` is the small DOM wrapper
// the page uses. The screen follows `GameState.phase`, and "play again" is the
// `playAgain` message from the shared contract — the room transport plugs in
// with #12, where the socket lives.

import type { GameState, Phase, PlayerId } from "../shared/types.ts";

export interface RunSummary {
  distance: number;
  time: number;
  hull: number;
}

/** What an end screen says. */
export interface EndScreenView {
  /** Which ending this is; also written to `data-outcome` for styling. */
  outcome: "won" | "lost";
  title: string;
  detail: string;
  summary: string;
  /** Label of the button that starts the next run. */
  action: string;
  canStart: boolean;
}

const elapsed = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** A compact, stable summary for the result panel. */
export function runSummary(summary: RunSummary): string {
  return `Distance ${Math.max(0, Math.round(summary.distance))} m · Time ${elapsed(summary.time)} · Hull ${Math.max(0, Math.round(summary.hull))}%`;
}

/** The end screen for a phase, or `null` while the run is still going. */
export function endScreenFor(phase: Phase, summary: RunSummary = { distance: 0, time: 0, hull: 0 }, isHost = true): EndScreenView | null {
  const controls = {
    summary: runSummary(summary),
    action: isHost ? "New run" : "Waiting for the host…",
    canStart: isHost,
  };
  if (phase === "won") {
    return {
      outcome: "won",
      title: "You made it",
      detail: "The Last Train reached the station with the crew aboard.",
      ...controls,
    };
  }
  if (phase === "lost") {
    return {
      outcome: "lost",
      title: "The train is lost",
      detail: "The hull gave in before the station. The line wins this one.",
      ...controls,
    };
  }
  return null;
}

export interface EndScreenOptions {
  /** Called when the host starts the next run. */
  onNewRun: () => void;
  /** Called when this player leaves the room. */
  onLeave: () => void;
}

export interface EndScreen {
  /** Shows the screen for `won` / `lost` and hides it otherwise. */
  update(state: GameState | Phase, playerId?: PlayerId): void;
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
  const summary = document.createElement("p");
  summary.className = "endscreen-summary";
  const actions = document.createElement("div");
  actions.className = "endscreen-actions";
  const action = document.createElement("button");
  action.type = "button";
  action.className = "endscreen-action";
  action.addEventListener("click", () => options.onNewRun());
  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "endscreen-leave";
  leave.textContent = "Leave";
  leave.addEventListener("click", () => options.onLeave());

  actions.append(action, leave);
  panel.append(title, detail, summary, actions);
  root.append(panel);
  container.append(root);

  return {
    update(state: GameState | Phase, playerId?: PlayerId): void {
      const phase = typeof state === "string" ? state : state.phase;
      const view = endScreenFor(
        phase,
        typeof state === "string" ? undefined : { ...state.journey, time: state.time },
        typeof state === "string" || state.lobby.hostId === playerId,
      );
      if (!view) {
        root.hidden = true;
        delete root.dataset.outcome;
        return;
      }
      title.textContent = view.title;
      detail.textContent = view.detail;
      summary.textContent = view.summary;
      action.textContent = view.action;
      action.disabled = !view.canStart;
      root.dataset.outcome = view.outcome;
      root.hidden = false;
    },
  };
}
