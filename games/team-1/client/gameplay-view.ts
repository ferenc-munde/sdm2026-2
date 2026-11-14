import type { GameClientSnapshot, GameStateAdapter } from "./game-state-adapter.mjs";
import { conditionBand, formatCountdown, toOutcomeViewModel, toTaskViewModels, toPlayerViewModels } from "./presentation-model.mjs";
import { mountTrainScene, type TrainScene } from "./player-scene";

export type PreviewAction = "advance-time" | "damage-train" | "progress-repair" | "win" | "fail" | "reset";

export type GameplayViewOptions = {
  roomCode: string;
  onExit: () => void;
  onPreviewAction: (action: PreviewAction) => void;
  /** True when the snapshots come from a platform room: hides the mock controls and labels. */
  live?: boolean;
  createScene?: (canvas: HTMLCanvasElement, fallback: HTMLElement) => TrainScene;
};

export function mountGameplayView(root: HTMLElement, adapter: GameStateAdapter, options: GameplayViewOptions): () => void {
  root.innerHTML = `
    <div class="game-heading">
      <div><div class="panel-index">DEPARTURE IN PROGRESS</div><h2>The Night Line</h2></div>
      <div class="game-heading-actions"><span class="status-chip"><span id="game-connection-dot" class="live-dot"></span><span id="game-connection">CONNECTED</span></span><button id="return-crew" class="leave-button" type="button">Back to crew <span aria-hidden="true">↗</span></button></div>
    </div>
      <div class="game-room-code">CREW CODE <strong>${escapeHtml(options.roomCode)}</strong><span>${options.live ? "LIVE ROOM STATE" : "LOCAL MOCK STATE"}</span><span class="movement-hint">MOVE: WASD / ARROWS${options.live ? " · REPAIR: E" : ""}</span></div>
    <div class="game-layout">
      <section class="scene-panel" aria-label="Train and player view">
        <canvas id="train-canvas" class="train-canvas" aria-label="Three-dimensional cutaway view of the train and crew"></canvas>
        <div id="scene-fallback" class="scene-fallback" hidden>3D view is unavailable in this browser. Crew status is still shown alongside.</div>
        <div class="scene-label"><span class="live-dot"></span> CARRIAGE 01 <span>·</span> NIGHT LINE</div>
      </section>
      <aside class="hud-panel" aria-label="Train status">
        <section class="hud-block countdown-block"><div class="hud-label">TIME TO DESTINATION</div><output id="countdown" class="countdown-value" role="timer" aria-live="off">03:00</output><span class="hud-subtext">BACKEND STATE · MM:SS</span></section>
        <section class="hud-block condition-block"><div class="hud-label">TRAIN CONDITION <strong id="condition-value">100%</strong></div><div id="condition-meter" class="condition-track" role="meter" aria-label="Train condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="condition-fill" class="condition-fill"></div></div><span id="condition-caption" class="hud-subtext">SYSTEMS STABLE</span></section>
        <section class="hud-block repair-block"><div class="hud-label">REPAIRS <strong id="repair-count">0 / 3</strong></div><progress id="repair-progress" class="repair-progress" max="3" value="0" aria-label="Completed repairs"></progress><ul id="task-list" class="task-list"></ul></section>
        <section class="hud-block crew-block"><div class="hud-label">CREW ON BOARD <strong id="crew-count">0 / 4</strong></div><ul id="game-players" class="game-player-list" aria-label="Crew connection status"></ul></section>
      </aside>
    </div>
    ${options.live ? "" : `<details class="mock-controls" open><summary><span class="mock-dot"></span> LOCAL MOCK SNAPSHOT CONTROLS <span class="mock-warning">PREVIEW ONLY</span></summary><div class="mock-actions"><button type="button" data-action="advance-time">Advance 15 sec</button><button type="button" data-action="damage-train">Damage train</button><button type="button" data-action="progress-repair">Progress repair</button><button type="button" data-action="win">Preview victory</button><button type="button" data-action="fail">Preview failure</button><button type="button" data-action="reset">Reset preview</button></div></details>`}
    <section id="outcome-overlay" class="outcome-overlay" role="dialog" aria-modal="true" aria-labelledby="outcome-title" hidden><div class="outcome-card"><div id="outcome-kicker" class="panel-index">JOURNEY COMPLETE</div><h2 id="outcome-title"></h2><p id="outcome-message"></p><button id="outcome-return" class="button button-primary" type="button"><span>Return to crew</span><span aria-hidden="true">↗</span></button></div></section>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#train-canvas")!;
  const fallback = root.querySelector<HTMLElement>("#scene-fallback")!;
  const scene = (options.createScene ?? mountTrainScene)(canvas, fallback);
  const unsubscribe = adapter.subscribe((snapshot) => renderSnapshot(snapshot));
  root.querySelector<HTMLButtonElement>("#return-crew")!.addEventListener("click", options.onExit);
  root.querySelector<HTMLButtonElement>("#outcome-return")!.addEventListener("click", options.onExit);
  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => options.onPreviewAction(button.dataset.action as PreviewAction));
  });
  renderSnapshot(adapter.getSnapshot());

  return () => {
    unsubscribe();
    scene.dispose();
    root.replaceChildren();
  };

  function renderSnapshot(snapshot: GameClientSnapshot): void {
    const time = root.querySelector<HTMLOutputElement>("#countdown")!;
    time.value = formatCountdown(snapshot.secondsRemaining);
    time.textContent = formatCountdown(snapshot.secondsRemaining);
    time.classList.toggle("is-urgent", snapshot.secondsRemaining <= 30);

    const band = conditionBand(snapshot.trainCondition);
    const condition = root.querySelector<HTMLElement>("#condition-value")!;
    condition.textContent = `${Math.round(snapshot.trainCondition)}%`;
    condition.dataset.band = band;
    root.querySelector<HTMLElement>(".condition-block")!.dataset.band = band;
    root.querySelector<HTMLElement>("#condition-meter")!.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, snapshot.trainCondition))));
    const fill = root.querySelector<HTMLElement>("#condition-fill")!;
    fill.style.width = `${Math.min(100, Math.max(0, snapshot.trainCondition))}%`;
    fill.dataset.band = band;
    root.querySelector<HTMLElement>("#condition-caption")!.textContent = band === "critical" ? "CRITICAL — REPAIR REQUIRED" : band === "strained" ? "SYSTEMS UNDER STRAIN" : "SYSTEMS STABLE";

    root.querySelector<HTMLElement>("#repair-count")!.textContent = `${snapshot.repairs.completed} / ${snapshot.repairs.total}`;
    const repairProgress = root.querySelector<HTMLProgressElement>("#repair-progress")!;
    repairProgress.max = Math.max(1, snapshot.repairs.total);
    repairProgress.value = Math.min(snapshot.repairs.completed, snapshot.repairs.total);
    root.querySelector<HTMLElement>("#task-list")!.innerHTML = toTaskViewModels(snapshot.tasks).map((task) => `
      <li class="task-row task-${task.status}"><span class="task-icon" aria-hidden="true">${task.status === "complete" ? "✓" : task.status === "in-progress" ? "◌" : "○"}</span><span class="task-content"><span class="task-title">${escapeHtml(task.label)}</span><span class="task-track"><span style="width:${task.progress}%"></span></span></span><span class="task-status">${task.statusLabel}</span></li>`).join("");

    const players = toPlayerViewModels(snapshot);
    root.querySelector<HTMLElement>("#crew-count")!.textContent = `${players.length} / 4`;
    root.querySelector<HTMLElement>("#game-players")!.innerHTML = players.map((player) => `
      <li class="game-player-row"><span class="game-player-color" style="--player-color:${escapeHtml(player.color)}"></span><span class="game-player-name">${escapeHtml(player.name)}</span><span class="game-player-state ${player.connected ? "online" : "offline"}">${player.connected ? "HERE" : "RECONNECTING"}</span></li>`).join("");
    const connection = root.querySelector<HTMLElement>("#game-connection")!;
    connection.textContent = snapshot.connectionState.replace("-", " ").toUpperCase();
    root.querySelector<HTMLElement>("#game-connection-dot")!.classList.toggle("is-offline", snapshot.connectionState !== "connected");
    scene.update(snapshot);

    const outcome = toOutcomeViewModel(snapshot.outcome);
    const overlay = root.querySelector<HTMLElement>("#outcome-overlay")!;
    const nextOutcome = outcome?.tone ?? "playing";
    const previousOutcome = overlay.dataset.tone ?? "playing";
    overlay.hidden = !outcome;
    overlay.dataset.tone = nextOutcome;
    if (outcome) {
      root.querySelector<HTMLElement>("#outcome-title")!.textContent = outcome.title;
      root.querySelector<HTMLElement>("#outcome-message")!.textContent = outcome.message;
      root.querySelector<HTMLElement>("#outcome-kicker")!.textContent = outcome.tone === "victory" ? "JOURNEY COMPLETE" : "JOURNEY ENDED";
      if (nextOutcome !== previousOutcome) root.querySelector<HTMLButtonElement>("#outcome-return")!.focus();
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
