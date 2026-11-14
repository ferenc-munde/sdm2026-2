import { journeyView } from "./journey-view";
import { taskColor } from "./train-map";
// Only the latest HUD may own the global safe-area value.
let hudOffsetOwner: symbol | undefined;

export interface HudTask {
  id: string;
  title: string;
  current: number;
  target: number;
  /** Task type; tints the row chip to match the station beacon colour. */
  type?: string;
}

export interface HudJourney {
  distance: number; // 0..1
  remainingSeconds: number;
  totalSeconds: number;
  phase: "lobby" | "running" | "won" | "lost";
  speed?: number; // normalized route distance per second (SPEC §8.4)
  reason?: string;
}

/** Display only: the game server decides task progress. */
export function createHud(container: HTMLElement, onReturnToLobby?: () => void) {
  const panel = document.createElement("section");
  panel.className = "train-hud";
  panel.setAttribute("aria-label", "Crew tasks");
  const heading = document.createElement("h2");
  heading.textContent = "Crew Tasks";
  const list = document.createElement("ul");
  const empty = document.createElement("p");
  empty.textContent = "No active tasks. Stay ready, crew.";
  panel.append(heading, list, empty);
  container.append(panel);
  const rows = new Map<string, HTMLLIElement>();
  const journey = document.createElement("section");
  journey.className = "train-journey";
  journey.setAttribute("aria-label", "Journey to station");
  const journeyText = document.createElement("div");
  journeyText.className = "journey-heading";
  const journeyDistance = document.createElement("div");
  const journeyStats = document.createElement("div");
  journeyStats.className = "journey-stats";
  const timeMetric = document.createElement("div");
  timeMetric.className = "train-countdown";
  timeMetric.setAttribute("role", "timer");
  timeMetric.setAttribute("aria-label", "Time remaining");
  const timeLabel = document.createElement("span");
  timeLabel.textContent = "TIME LEFT";
  const timeValue = document.createElement("strong");
  timeMetric.append(timeLabel, timeValue);
  const speedMetric = document.createElement("div");
  const speedLabel = document.createElement("span");
  speedLabel.textContent = "SPEED";
  const speedValue = document.createElement("strong");
  speedMetric.append(speedLabel, speedValue);
  journeyStats.append(speedMetric);
  const track = document.createElement("div");
  track.className = "train-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Journey distance");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const train = document.createElement("span");
  train.className = "train-marker";
  // CSS-drawn marker keeps the same appearance across platforms (no emoji).
  train.textContent = "";
  train.setAttribute("aria-hidden", "true");
  const station = document.createElement("span");
  station.className = "train-station";
  station.textContent = "";
  station.setAttribute("aria-hidden", "true");
  const pace = document.createElement("small");
  track.append(train, station);
  journey.append(journeyText, journeyDistance, track, journeyStats, pace);
  const topbar = document.createElement("header");
  topbar.className = "train-topbar";
  topbar.setAttribute("aria-label", "Train status");
  topbar.append(journey, timeMetric);
  const result = document.createElement("section");
  result.className = "train-result";
  result.setAttribute("role", "status");
  const resultTitle = document.createElement("h1");
  const resultText = document.createElement("p");
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.textContent = "Return to Lobby";
  returnButton.addEventListener("click", () => onReturnToLobby?.());
  result.append(resultTitle, resultText, returnButton);
  result.hidden = true;
  container.append(topbar, result);
  // Reserve actual HUD height so the first carriage never sits behind it.
  const offsetOwner = Symbol("hud-safe-area");
  hudOffsetOwner = offsetOwner;
  let lastSafeTop: string | undefined;
  const resizeObserver = new ResizeObserver(() => {
    if (hudOffsetOwner !== offsetOwner) return;
    lastSafeTop = `${Math.ceil(topbar.getBoundingClientRect().bottom + 12)}px`;
    document.documentElement.style.setProperty("--hud-safe-top", lastSafeTop);
  });
  resizeObserver.observe(topbar);

  return {
    updateJourney(values: HudJourney) {
      const view = journeyView(values);
      journeyText.textContent = values.phase === "lobby" ? "Waiting for crew" : "Journey to station";
      journeyDistance.textContent = `${Math.round((1 - view.distance) * 100)}% to destination`;
      timeValue.textContent = view.timeText;
      timeMetric.classList.toggle("is-urgent", view.urgent);
      speedValue.textContent = view.speedText;
      speedValue.title = "Percent of the route travelled per second";
      train.style.left = `${view.distance * 100}%`;
      track.setAttribute("aria-valuenow", String(view.distance * 100));
      track.setAttribute("aria-valuetext", view.distanceText);
      journey.classList.toggle("is-behind", view.behind);
      pace.textContent = values.phase === "lobby" ? "Departing soon"
        : values.phase === "won" || values.phase === "lost" ? "Journey ended"
        : view.behind ? "Behind schedule"
        : "On schedule";
      const won = values.phase === "won";
      const lost = values.phase === "lost";
      result.hidden = !won && !lost;
      result.classList.toggle("is-won", won);
      if (won) {
        resultTitle.textContent = "Congratulations!";
        resultText.textContent = "Your crew made it! The train arrived safely.";
      } else if (lost) {
        resultTitle.textContent = "Better Luck Next Time!";
        resultText.textContent = "The journey is over. Don't give up, crew!";
      }
    },
    // Compatibility for the standalone preview; gauges are no longer displayed.
    updateGauges(_values: { power: number; pressure: number }) {},
    updateTasks(tasks: Iterable<HudTask>) {
      const seen = new Set<string>();
      for (const task of tasks) {
        seen.add(task.id);
        let row = rows.get(task.id);
        if (!row) {
          row = document.createElement("li");
          rows.set(task.id, row);
          list.append(row);
        }
        const done = task.current >= task.target;
        row.classList.toggle("is-complete", done);
        row.textContent = "";
        const chip = document.createElement("span");
        chip.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:6px;background:${taskColor(task.type ?? "")}`;
        row.append(chip, document.createTextNode(`${done ? "✓" : "○"} ${task.title} — ${task.current}/${task.target}`));
      }
      for (const [id, row] of rows) {
        if (!seen.has(id)) {
          row.remove();
          rows.delete(id);
        }
      }
      empty.hidden = rows.size > 0;
    },
    destroy() {
      resizeObserver.disconnect();
      if (hudOffsetOwner === offsetOwner) {
        if (document.documentElement.style.getPropertyValue("--hud-safe-top") === lastSafeTop) {
          document.documentElement.style.removeProperty("--hud-safe-top");
        }
        hudOffsetOwner = undefined;
      }
      panel.remove();
      topbar.remove();
      result.remove();
      rows.clear();
    },
  };
}
