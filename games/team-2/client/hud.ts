import { journeyView } from "./journey-view";

export interface HudTask {
  id: string;
  title: string;
  current: number;
  target: number;
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
export function createHud(container: HTMLElement) {
  const panel = document.createElement("section");
  panel.className = "train-hud";
  panel.setAttribute("aria-label", "Crew tasks");
  const heading = document.createElement("h2");
  heading.textContent = "Crew Tasks";
  const list = document.createElement("ul");
  const empty = document.createElement("p");
  empty.textContent = "No active tasks. Stay ready, crew.";
  panel.append(heading, list, empty);
  const gauges = document.createElement("div");
  gauges.className = "train-hud-gauges";
  function createGauge(name: string, initial: number) {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    const bar = document.createElement("progress");
    bar.max = 100;
    bar.setAttribute("aria-label", name);
    label.append(caption, bar);
    gauges.append(label);
    function update(value: number) {
      const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
      bar.value = percent;
      caption.textContent = `${name}: ${Math.round(percent)}%`;
      const danger = name === "Power" ? percent < 15 : percent >= 100;
      label.classList.toggle("is-danger", danger);
      if (danger) caption.textContent += " !";
      label.title = danger ? name === "Power" ? "Low power" : "Pressure overload" : name;
      bar.setAttribute("aria-valuetext", `${Math.round(percent)}%${danger ? `, ${label.title}` : ""}`);
    }
    update(initial);
    return update;
  }
  const updatePower = createGauge("Power", 100);
  const updatePressure = createGauge("Pressure", 0);
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
  topbar.append(journey, timeMetric, gauges);
  const result = document.createElement("section");
  result.className = "train-result";
  result.setAttribute("role", "status");
  const resultTitle = document.createElement("h1");
  const resultText = document.createElement("p");
  result.append(resultTitle, resultText);
  result.hidden = true;
  container.append(topbar, result);
  // Reserve actual HUD height so the first carriage never sits behind it.
  const resizeObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--hud-safe-top", `${Math.ceil(topbar.getBoundingClientRect().bottom + 12)}px`);
  });
  resizeObserver.observe(topbar);

  return {
    updateJourney(values: HudJourney) {
      const view = journeyView(values);
      journeyText.textContent = values.phase === "lobby" ? "Waiting for crew" : "Journey to station";
      journeyDistance.textContent = `${Math.round((1 - view.distance) * 100)}% to destination`;
      timeValue.textContent = view.timeText;
      timeMetric.classList.toggle("is-urgent", view.urgent);
      speedValue.textContent = view.speedText.replace("% route/s", "% /s");
      speedValue.title = "Percent of the route travelled per second";
      train.style.left = `${view.distance * 100}%`;
      track.setAttribute("aria-valuenow", String(view.distance * 100));
      track.setAttribute("aria-valuetext", view.distanceText);
      journey.classList.toggle("is-behind", view.behind);
      pace.textContent = values.phase === "lobby" ? "Departing soon"
        : values.phase === "won" || values.phase === "lost" ? "Journey ended"
        : view.behind ? "Behind schedule"
        : "On schedule";
      result.hidden = values.phase !== "won" && values.phase !== "lost";
      result.classList.toggle("is-won", values.phase === "won");
      resultTitle.textContent = values.phase === "won" ? "Docked Safe" : "Journey Lost";
      resultText.textContent = values.reason || (values.phase === "won" ? "The crew made it to the station." : "The train did not reach safety.");
    },
    updateGauges(values: { power: number; pressure: number }) {
      updatePower(values.power);
      updatePressure(values.pressure);
    },
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
        row.textContent = `${done ? "✓" : "○"} ${task.title} — ${task.current}/${task.target}`;
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
      document.documentElement.style.removeProperty("--hud-safe-top");
      panel.remove();
      topbar.remove();
      result.remove();
      rows.clear();
    },
  };
}
