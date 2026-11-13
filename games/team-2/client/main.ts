import { createTrainScene } from "./scene";
import { createHud, type HudTask, type HudJourney } from "./hud";
import { createLocalStateModel } from "./stateModel.ts";
import { localStateToHud } from "./state-to-hud";
import gameConfig from "../config/game.json";
import { TRAIN_CARS } from "./train-map";
import { mountLobby } from "./lobby";
import "./hud.css";
import "./styles.css";

const sceneRoot = document.querySelector<HTMLElement>("#scene, #app");
if (!sceneRoot) throw new Error("Scene container is missing");
let trainScene: ReturnType<typeof createTrainScene> | undefined;
try { trainScene = createTrainScene(sceneRoot); }
catch (error) {
  sceneRoot.textContent = "The 2D scene could not start. Try a browser with WebGL enabled.";
  console.error(error);
}
const hud = createHud(document.querySelector<HTMLElement>("#hud")!);
const model = createLocalStateModel();
const runStartTick = model.state.tick;
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
const isPreview = () => mode.value === "preview";

mapSelect.addEventListener("change", () => {
  const car = mapSelect.value === "all" ? null : Number(mapSelect.value);
  trainScene?.focusCar(car);
  document.getElementById("map-description")!.textContent = car === null
    ? "Four open bulkheads connect the five carriages. Gold squares mark relief hatches."
    : TRAIN_CARS[car]!.stations.map(station => station.label).join(" · ");
});

function update() {
  if (isPreview()) {
    hud.updateTasks(tasks);
    hud.updateGauges({ power: tasks[0]?.current ? 100 : 40, pressure: 35 });
    hud.updateJourney(journey);
    trainScene?.setSpeed(journey.phase === "running" ? demoSpeed : 0);
  } else {
    const view = localStateToHud(model.state, gameConfig.tickRate, runStartTick);
    hud.updateTasks(view.tasks);
    hud.updateGauges(view.gauges);
    hud.updateJourney(view.journey);
    trainScene?.setSpeed(view.speed);
  }
  trainScene?.setPaused(demoPaused);
  speedLabel.value = `${demoSpeed.toFixed(1)}x`;
  pauseButton.textContent = demoPaused ? "Resume scenery" : "Pause scenery";
  pauseButton.setAttribute("aria-pressed", String(demoPaused));
  status.value = `Local tick ${model.state.tick} · phase ${model.state.phase} · ${isPreview() ? "EXAMPLE DATA" : "LOCAL RULES · WASD/arrows, E pickup, Q drop"}`;
}
function reset() {
  demoSpeed = 1; demoPaused = false; speedInput.value = "1";
  tasks = [{ id: "example-repair", title: "Example: repair electrical panel", current: 0, target: 1 }];
  journey = { distance: 0, remainingSeconds: 300, totalSeconds: 300, phase: "running" };
  update();
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
mode.addEventListener("change", syncMode);
// Preserve the adapter's input envelope and demo item identifier.
const moves: Record<string, [number, number]> = {
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
function onKey(event: KeyboardEvent) {
  if (isPreview() || (event.target instanceof HTMLElement &&
    (event.target.closest("input, select, textarea, button") || event.target.isContentEditable))) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.repeat && (key === "e" || key === "q")) return;
  const axis = moves[key];
  if (axis) {
    model.send({ type: "move", mx: axis[0], my: axis[1], run: event.shiftKey });
    event.preventDefault();
  } else if (key === "e") model.send({ type: "pickup", itemId: "wrench" });
  else if (key === "q") model.send({ type: "drop", itemId: "wrench" });
}
window.addEventListener("keydown", onKey);
model.onTick(update);
reset(); syncMode(); model.start();
const lobby = mountLobby(document.body, (match) => {
  // The lobby is networked; gameplay still uses the existing local rules adapter.
  if (isPreview()) journey.phase = "running";
  update();
  status.value = `Crew aboard · ${match.playerCount}/${match.teamSize} · ${match.players.map((player) => player.name).join(", ")}`;
});
window.addEventListener("pagehide", () => {
  model.stop(); window.removeEventListener("keydown", onKey);
  lobby.destroy(); trainScene?.destroy(); hud.destroy();
});
