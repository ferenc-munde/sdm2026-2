import { createTrainScene } from "./scene";
import { createHud, type HudTask, type HudJourney } from "./hud";
import "./hud.css";
import "./styles.css";
import { TRAIN_CARS } from "./train-map";

const sceneRoot = document.querySelector<HTMLElement>("#scene")!;
let trainScene: ReturnType<typeof createTrainScene> | undefined;
try {
  trainScene = createTrainScene(sceneRoot);
} catch (error) {
  sceneRoot.textContent = "The 2D scene could not start. Try a browser with WebGL enabled.";
  console.error(error);
}
const hud = createHud(document.querySelector<HTMLElement>("#hud")!);
let tasks: HudTask[] = [];
let journey: HudJourney;
let demoSpeed = 1;
let demoPaused = false;
const speedInput = document.querySelector<HTMLInputElement>("#speed")!;
const speedLabel = document.querySelector<HTMLOutputElement>("#speed-value")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause-motion")!;
const mapSelect = document.querySelector<HTMLSelectElement>("#map-car")!;
mapSelect.addEventListener("change", () => {
  const car = mapSelect.value === "all" ? null : Number(mapSelect.value);
  trainScene?.focusCar(car);
  document.getElementById("map-description")!.textContent = car === null
    ? "Four open bulkheads connect the five carriages. Gold squares mark relief hatches."
    : TRAIN_CARS[car]!.stations.map(station => station.label).join(" · ");
});
function update() {
  hud.updateTasks(tasks);
  hud.updateGauges({ power: tasks[0]?.current ? 100 : 40, pressure: 35 });
  hud.updateJourney(journey);
  trainScene?.setSpeed(journey.phase === "running" ? demoSpeed : 0);
  trainScene?.setPaused(demoPaused);
  speedLabel.value = `${demoSpeed.toFixed(1)}x`;
  pauseButton.textContent = demoPaused ? "Resume scenery" : "Pause scenery";
  pauseButton.setAttribute("aria-pressed", String(demoPaused));
}
function reset() {
  demoSpeed = 1;
  demoPaused = false;
  speedInput.value = "1";
  tasks = [{ id: "example-repair", title: "Example: repair electrical panel", current: 0, target: 1 }];
  journey = { distance: 0, remainingSeconds: 300, totalSeconds: 300, phase: "running" };
  update();
}
function button(id: string, action: () => void) {
  document.getElementById(id)!.addEventListener("click", () => { action(); update(); });
}
button("travel", () => { journey.distance = Math.min(1, journey.distance + 0.1); });
button("elapsed", () => { journey.remainingSeconds = Math.max(0, journey.remainingSeconds - 30); });
button("repair", () => { if (tasks[0]) tasks[0].current = 1; });
button("dock", () => { journey.distance = 1; journey.phase = "won"; });
button("fail", () => { journey.phase = "lost"; });
button("restart", reset);
button("pause-motion", () => { demoPaused = !demoPaused; });
speedInput.addEventListener("input", () => { demoSpeed = Number(speedInput.value); update(); });
window.addEventListener("pagehide", () => { trainScene?.destroy(); hud.destroy(); });
reset();
