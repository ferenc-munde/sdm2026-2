import { createTrainScene, type SceneTaskMarker } from "./scene";
import { createHud, type HudTask, type HudJourney } from "./hud";
import { createLocalStateModel, type GameSession, type StateModel } from "./stateModel.ts";
import { hostGame, joinGame, serverAddress, type NetSession } from "./net.ts";
import { localStateToHud } from "./state-to-hud";
import gameConfig from "../config/game.json";
import { TRAIN_CARS } from "./train-map";
import { createInputAdapter } from "./input.ts";
import { mountLobby } from "./lobby";
import { mountGameRules } from "./rules";
import { openTaskModal, closeTaskModal, showStationPrompt, showTaskToast, type OpenTask } from "./task-modal";
import { getAudioSettings, playAmbient, playButtonInteraction, playLobbyMusic, playPuzzleAction, playPuzzleSuccess, playTrainAmbience, playWarning, setAudioVolume, stopAmbient, stopLobbyMusic, stopTrainAmbience, taskSpawnPing, toggleAudioMute, unlockAudio } from "./audio";
import "./hud.css";
import "./styles.css";

// How the page gets its game state:
//   (default)    lobby → networked game room on the server (net.ts)
//   ?room=CODE   skip the lobby and join that game room directly
//   ?local       offline demo: the rules run in this browser (stateModel.ts), no server needed
// `?lobby=http://host:port` (or VITE_SERVER_URL at build time) points at another server.
const params = new URLSearchParams(window.location.search);
const developerTools = import.meta.env.DEV && params.get("debug") === "1";
document.getElementById("demo-controls")!.hidden = !developerTools;
document.body.classList.toggle("has-dev-tools", developerTools);
const offline = params.has("local");
const server = serverAddress(window.location, params.get("lobby") ?? import.meta.env.VITE_SERVER_URL);
const GAME_CODE_TIMEOUT_MS = 15000;

const sceneRoot = document.querySelector<HTMLElement>("#scene, #app");
if (!sceneRoot) throw new Error("Scene container is missing");
let trainScene: ReturnType<typeof createTrainScene> | undefined;
try { trainScene = createTrainScene(sceneRoot); }
catch (error) {
  sceneRoot.textContent = "The 2D scene could not start. Try a browser with WebGL enabled.";
  console.error(error);
}
const hud = createHud(document.querySelector<HTMLElement>("#hud")!, () => { void returnToLobby(); });
// The offline model also runs behind the lobby until the game room is joined.
let local = createLocalStateModel();
let session: GameSession = local;
let online = false;
let activeNetSession: NetSession | undefined;
let canControlGame = false;
let netStatus = offline ? "" : "Not in a game room yet · join through the lobby";
let cleanupInput: () => void = () => {};
let refreshMovement: () => void = () => {};
let inputInstalled = false;
const mode = document.querySelector<HTMLSelectElement>("#view-mode")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const speedInput = document.querySelector<HTMLInputElement>("#speed")!;
const speedLabel = document.querySelector<HTMLOutputElement>("#speed-value")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause-motion")!;
const mapSelect = document.querySelector<HTMLSelectElement>("#map-car")!;
let tasks: HudTask[] = [];
let journey: HudJourney;
let demoSpeed = 1;
let demoPaused = false;
const isPreview = () => developerTools && mode.value === "preview";

// --- Tasks: station prompts, spawn noise, minigames -------------------------
const TASK_RANGE = 30; // map units between the player and a task station
const stationsById = new Map<string, { x: number; y: number }>();
for (const car of TRAIN_CARS) {
  for (const station of car.stations) stationsById.set(station.id, { x: station.x, y: station.y });
}
let knownTaskIds = new Set<string>();
let promptTaskId: string | undefined;
let powerWasDangerous = false;
let pressureWasDangerous = false;

function nearestTaskInTaskRange(): OpenTask | undefined {
  const state = session.state;
  const me = state.players.get(session.playerId);
  if (!me) return undefined;
  let best: OpenTask | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [id, task] of state.tasks) {
    const station = stationsById.get(task.stationId);
    if (!station) continue;
    const distance = Math.hypot(station.x - me.x, station.y - me.y);
    if (distance <= TASK_RANGE && distance < bestDistance) {
      bestDistance = distance;
      best = { id, title: task.title, type: task.type, minigame: task.minigame, current: task.current, target: task.target };
    }
  }
  return best;
}

function openTask(task: OpenTask): void {
  const taskSession = session;
  unlockAudio();
  playAmbient(task.type);
  openTaskModal(task, (amount) => {
    if (session !== taskSession || !isGameplayActive()) return;
    playPuzzleSuccess(task.minigame);
    session.send({ type: "progress", taskId: task.id, amount });
  }, { onClosed: () => { if (session === taskSession) stopAmbient(); } });
}

/** New task ids since the last update → spawn ping + toast ("the noise"). */
function watchTaskNoise(liveTasks: ReadonlyMap<string, { title: string }>): void {
  for (const [id, task] of liveTasks) {
    if (!knownTaskIds.has(id)) {
      taskSpawnPing();
      showTaskToast(`New task: ${task.title}`);
    }
  }
  knownTaskIds = new Set(liveTasks.keys());
}


mapSelect.addEventListener("change", () => {
  if (mapSelect.value === "follow") {
    trainScene?.followPlayer();
    document.getElementById("map-description")!.textContent = "Following your player · nearby carriages and passages stay visible.";
    return;
  }
  const car = mapSelect.value === "all" ? null : Number(mapSelect.value);
  trainScene?.focusCar(car);
  document.getElementById("map-description")!.textContent = car === null
    ? "Four open bulkheads connect the five carriages. Gold squares mark relief hatches."
    : TRAIN_CARS[car]!.stations.map(station => station.label).join(" · ");
});

function describeSession(): string {
  const state = session.state;
  if (online) return `Room ${session.code} · ${state.players.size} crew aboard · tick ${state.tick} · WASD/arrows move, Shift runs, E pickup, Q drop`;
  const source = offline ? "LOCAL RULES (offline)" : netStatus;
  return `Local tick ${state.tick} · phase ${state.phase} · ${source} · WASD/arrows move, Shift runs, E pickup, Q drop`;
}

function update() {
  const state = session.state;
  const terminal = state.phase === "won" || state.phase === "lost";
  if (terminal) {
    if (canControlGame) {
      canControlGame = false;
      removeInputAdapter();
    }
    closeTaskModal();
    stopAmbient();
    promptTaskId = undefined;
    showStationPrompt(null);
  }
  const view = localStateToHud(state, gameConfig.tickRate);
  const idle = !canControlGame && state.phase === "running";
  const journeyView = idle ? { ...view.journey, phase: "lobby" as const } : view.journey;
  if (isPreview()) {
    hud.updateTasks(tasks);
    hud.updateGauges({ power: tasks[0]?.current ? 100 : 40, pressure: 35 });
    hud.updateJourney({ ...journey, speed: journey.phase === "running" && !demoPaused ? demoSpeed / gameConfig.timeLimitSeconds : 0 });
    trainScene?.setSpeed(journey.phase === "running" ? demoSpeed : 0);
    showStationPrompt(null);
    const demo = stationsById.get("breaker-box")!;
    trainScene?.setTaskMarkers([{ id: "example-repair", x: demo.x, y: demo.y, type: "POWER" }]);
  } else {
    hud.updateTasks(idle ? [] : view.tasks);
    hud.updateGauges(idle ? { power: 100, pressure: 0 } : view.gauges);
    hud.updateJourney(journeyView);
    // The scene expects a scenery multiplier; rules publish route fractions per second.
    trainScene?.setSpeed(view.speed * gameConfig.timeLimitSeconds);

    if (isGameplayActive()) {
      const powerDanger = view.gauges.power < 15;
      const pressureDanger = view.gauges.pressure >= 100;
      if ((powerDanger && !powerWasDangerous) || (pressureDanger && !pressureWasDangerous)) playWarning();
      powerWasDangerous = powerDanger;
      pressureWasDangerous = pressureDanger;

      const liveTasks = new Map(Array.from(state.tasks, ([id, task]) => [id, { title: task.title }] as const));
      watchTaskNoise(liveTasks);
      const inRange = nearestTaskInTaskRange();
      promptTaskId = inRange?.id;
      showStationPrompt(inRange ? `E — ${inRange.title}` : null);

      const taskMarkers: SceneTaskMarker[] = [];
      for (const [id, task] of state.tasks) {
        const station = stationsById.get(task.stationId);
        if (station) taskMarkers.push({ id, x: station.x, y: station.y, type: task.type });
      }
      trainScene?.setTaskMarkers(taskMarkers);
    } else {
      promptTaskId = undefined;
      showStationPrompt(null);
      trainScene?.setTaskMarkers([]);
    }
  }
  // Draw players and items from the live game state every frame.
  trainScene?.setPlayers(state.players, session.playerId);
  trainScene?.setItems(state.items);
  trainScene?.setPaused(developerTools && demoPaused);
  speedLabel.value = `${demoSpeed.toFixed(1)}x`;
  pauseButton.textContent = demoPaused ? "Resume scenery" : "Pause scenery";
  pauseButton.setAttribute("aria-pressed", String(demoPaused));
  status.value = isPreview() ? `EXAMPLE DATA · ${online ? `room ${session.code}` : "no game room"}` : describeSession();
}
function reset() {
  demoSpeed = 1; demoPaused = false; speedInput.value = "1";
  tasks = [{ id: "example-repair", title: "Example: repair electrical panel", current: 0, target: 1 }];
  journey = { distance: 0, remainingSeconds: gameConfig.timeLimitSeconds, totalSeconds: gameConfig.timeLimitSeconds, phase: "running" };
  update();
}
function resetPerGameUi(): void {
  knownTaskIds = new Set(session.state.tasks.keys());
  promptTaskId = undefined;
  powerWasDangerous = false;
  pressureWasDangerous = false;
  tasks = [];
  journey = {
    distance: 0,
    remainingSeconds: gameConfig.timeLimitSeconds,
    totalSeconds: gameConfig.timeLimitSeconds,
    phase: "lobby",
  };
  demoSpeed = 1;
  demoPaused = false;
  speedInput.value = "1";
  speedLabel.value = "1.0x";
  pauseButton.textContent = "Pause scenery";
  pauseButton.setAttribute("aria-pressed", "false");
  hud.updateTasks([]);
  hud.updateGauges({ power: 100, pressure: 0 });
  hud.updateJourney(journey);
  showStationPrompt(null);
  document.querySelector(".ltm-toasts")?.remove();
  trainScene?.setSpeed(0);
  trainScene?.setTaskMarkers([]);
  trainScene?.setPlayers(session.state.players, session.playerId);
  trainScene?.setItems(session.state.items);
  status.value = describeSession();
}

function isGameplayActive(): boolean {
  return canControlGame && session.state.phase === "running";
}

function bindLocalSession(model: StateModel): void {
  model.onTick(() => {
    if (session === model) update();
  });
}

function installInputAdapter(): void {
  if (inputInstalled) return;
  const adapter = createInputAdapter({
    send: (input) => session.send(input),
    isEnabled: isGameplayActive,
    isPreview,
  });
  cleanupInput = adapter.cleanup;
  refreshMovement = adapter.refreshMovement;
  inputInstalled = true;
}

function removeInputAdapter(): void {
  if (!inputInstalled) return;
  inputInstalled = false;
  cleanupInput();
  cleanupInput = () => {};
  refreshMovement = () => {};
}
function button(id: string, action: () => void) {
  document.getElementById(id)!.addEventListener("click", () => {
    if (!isPreview() && id !== "pause-motion") return;
    action(); update();
  });
}
button("travel", () => { journey.distance = Math.min(1, journey.distance + 0.1); });
button("elapsed", () => { journey.remainingSeconds = Math.max(0, journey.remainingSeconds - 30); });
button("repair", () => { if (tasks[0]) tasks[0].current = 1; });
button("dock", () => { journey.distance = 1; journey.phase = "won"; });
button("fail", () => { journey.phase = "lost"; });
button("restart", reset);
button("pause-motion", () => { demoPaused = !demoPaused; });
speedInput.addEventListener("input", () => { demoSpeed = Number(speedInput.value); update(); });
function syncMode() {
  for (const id of ["travel", "elapsed", "repair", "dock", "fail", "restart", "speed"]) {
    (document.getElementById(id) as HTMLButtonElement | HTMLInputElement).disabled = !isPreview();
  }
  update();
}
mode.addEventListener("change", () => {
  // The scene preview renders example data: an open lobby would only cover it.
  if (mode.value === "preview") {
    lobby?.destroy();
    lobby = undefined;
    stopLobbyMusic();
  } else {
    mountLobbyIfNetworked();
  }
  syncMode();
});

installInputAdapter();

// Click is a user gesture, so this unlocks Web Audio and gives buttons a quiet tick.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const clickedButton = target.closest<HTMLButtonElement>("button");
  if (!clickedButton || clickedButton.disabled) return;
  unlockAudio();
  if (clickedButton.closest(".sound-controls")) return;
  const puzzleControl = target.closest<HTMLElement>(".ltm-crank, .ltm-node, .ltm-tile");
  if (puzzleControl) {
    playPuzzleAction(puzzleControl.classList.contains("ltm-crank") ? "crank" : puzzleControl.classList.contains("ltm-node") ? "wires" : "panel");
    return;
  }
  playButtonInteraction();
}, true);

const soundControls = document.createElement("section");
soundControls.className = "sound-controls";
soundControls.setAttribute("aria-label", "Sound controls");
soundControls.innerHTML = `
  <button type="button" data-volume-down aria-label="Decrease sound">−</button>
  <output data-volume-level aria-live="polite"></output>
  <button type="button" data-volume-up aria-label="Increase sound">+</button>
  <button type="button" data-mute aria-pressed="false">Mute</button>
`;
const volumeLevel = soundControls.querySelector<HTMLOutputElement>("[data-volume-level]")!;
const muteButton = soundControls.querySelector<HTMLButtonElement>("[data-mute]")!;
function updateSoundControls(): void {
  const settings = getAudioSettings();
  volumeLevel.value = `${Math.round(settings.volume * 100)}%`;
  volumeLevel.textContent = volumeLevel.value;
  muteButton.textContent = settings.muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-pressed", String(settings.muted));
}
soundControls.querySelector<HTMLButtonElement>("[data-volume-down]")!.addEventListener("click", () => {
  const settings = getAudioSettings();
  setAudioVolume(settings.volume - 0.1);
  updateSoundControls();
});
soundControls.querySelector<HTMLButtonElement>("[data-volume-up]")!.addEventListener("click", () => {
  const settings = getAudioSettings();
  setAudioVolume(settings.volume + 0.1);
  updateSoundControls();
});
muteButton.addEventListener("click", () => {
  toggleAudioMute();
  updateSoundControls();
});
updateSoundControls();
document.body.append(soundControls);

// E is contextual: a task station in range opens its minigame, otherwise pick up.
// Separate from the input adapter because it drives the modal, not a room input.
window.addEventListener("keydown", (event) => {
  if (!isGameplayActive() || isPreview() || event.repeat) return;
  if (event.key.length === 1 ? event.key.toLowerCase() !== "e" : event.key !== "e") return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.closest("input, select, textarea, button:not(.game-rules-control)") || target.isContentEditable)) return;
  unlockAudio();
  const task = promptTaskId ? session.state.tasks.get(promptTaskId) : undefined;
  if (task) {
    openTask({ id: promptTaskId!, title: task.title, type: task.type, minigame: task.minigame, current: task.current, target: task.target });
    event.preventDefault();
  } else {
    session.send({ type: "pickup", itemId: "wrench" });
  }
});

/** Swap the offline model for a seat in the game room. */
async function enterGameRoom(connect: () => Promise<NetSession>) {
  netStatus = "Connecting to the game room…";
  update();
  try {
    const next = await connect();
    local.stop();
    session = next;
    activeNetSession = next;
    online = true;
    resetPerGameUi();
    installInputAdapter();
    canControlGame = true;
    playTrainAmbience();
    refreshMovement();
    next.onTick(() => {
      if (session === next) update();
    });
    next.onClosed(() => {
      if (session !== next) return;
      activeNetSession = undefined;
      online = false;
      canControlGame = false;
      removeInputAdapter();
      closeTaskModal();
      stopAmbient();
      stopTrainAmbience();
      showStationPrompt(null);
      promptTaskId = undefined;
      netStatus = "The connection to the game room ended · return to the lobby to play again";
      update();
    });
  } catch (error) {
    netStatus = `Could not start the game: ${error instanceof Error ? error.message : String(error)}`;
    lobby?.showTransitionError(netStatus);
    console.error(error);
  }
  update();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

bindLocalSession(local);
reset(); syncMode();

let lobby: ReturnType<typeof mountLobby> | undefined;
const directCode = params.get("room");
let gameRules: ReturnType<typeof mountGameRules>;
let returningToStart = false;

/** Mount the lobby for networked play; a no-op when offline, already mounted, or seated. */
function mountLobbyIfNetworked(): void {
	if (offline || lobby || online) return;
	// Lobby creation/joining remains behind player entry and only connects on form submission.
	// The host creates the game room and shares its code; the rest of the crew joins that room.
	lobby = mountLobby(document.body, (match) => {
		stopLobbyMusic();
		void enterGameRoom(async () => {
			if (match.isHost) {
				const hosted = await hostGame(server, match.name);
				match.shareGameCode(hosted.code);
				return hosted;
			}
			const code = await withTimeout(match.gameCode, GAME_CODE_TIMEOUT_MS, "the host did not open a game room");
			return joinGame(server, code, match.name);
		}).finally(() => match.leaveLobby());
	}, server.http);
	playLobbyMusic();
}
function enterPlayerFlow(): void {
	if (offline) {
		// Preserve the explicit offline demo mode, but don't start it before the rules are accepted.
		session = local;
		resetPerGameUi();
		installInputAdapter();
		canControlGame = true;
		local.start();
		playTrainAmbience();
		update();
	} else if (directCode) {
		// Preserve direct room-code links; they still wait until the player continues past the rules.
		void enterGameRoom(() => joinGame(server, directCode));
	} else {
		mountLobbyIfNetworked();
	}
}

async function returnToLobby(): Promise<void> {
	if (returningToStart) return;
	returningToStart = true;
	const leavingNetSession = activeNetSession;
	canControlGame = false;
	removeInputAdapter();
	closeTaskModal();
	stopAmbient();
	stopTrainAmbience();
	stopLobbyMusic();
	promptTaskId = undefined;
	showStationPrompt(null);
	document.querySelector(".ltm-toasts")?.remove();

	if (!leavingNetSession && offline) session.stop();
	local.stop();
	activeNetSession = undefined;
	online = false;
	local = createLocalStateModel();
	bindLocalSession(local);
	session = local;
	netStatus = offline ? "" : "Not in a game room yet · join through the lobby";
	resetPerGameUi();

	try {
		if (leavingNetSession) {
			try {
				await leavingNetSession.stop();
			} catch (error) {
				netStatus = `Could not confirm leaving the game room (${error instanceof Error ? error.message : String(error)})`;
				console.error(error);
			}
		}
		if (offline) {
			gameRules.destroy();
			gameRules = mountGameRules(document.body, enterPlayerFlow);
		} else {
			lobby?.destroy();
			lobby = undefined;
			mountLobbyIfNetworked();
		}
	} catch (error) {
		netStatus = `Could not finish returning to the lobby (${error instanceof Error ? error.message : String(error)})`;
		console.error(error);
		status.value = netStatus;
	} finally {
		returningToStart = false;
	}
}

// Initial briefing and persistent help share one rules source and one fixed button.
gameRules = mountGameRules(document.body, enterPlayerFlow);
window.addEventListener("pagehide", () => {
  removeInputAdapter();
  session.stop(); local.stop();
  closeTaskModal(); stopAmbient(); stopTrainAmbience(); showStationPrompt(null);
	stopLobbyMusic();
	soundControls.remove();
  lobby?.destroy(); trainScene?.destroy(); hud.destroy();
  gameRules.destroy();
});
