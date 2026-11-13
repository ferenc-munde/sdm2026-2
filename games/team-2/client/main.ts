import { createTrainScene } from "./scene";
import { createHud, type HudTask, type HudJourney } from "./hud";
import { mountLobby } from "./lobby";
import "./hud.css";
import "./styles.css";

const sceneRoot = document.querySelector<HTMLElement>("#scene")!;
try {
  createTrainScene(sceneRoot);
} catch (error) {
  sceneRoot.textContent = "The 2D scene could not start. Try a browser with WebGL enabled.";
  console.error(error);
}
const hud = createHud(document.querySelector<HTMLElement>("#hud")!);
let tasks: HudTask[] = [];
let journey: HudJourney;
function update() {
  hud.updateTasks(tasks);
  hud.updateGauges({ power: tasks[0]?.current ? 100 : 40, pressure: 35 });
  hud.updateJourney(journey);
}
function reset() {
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
reset();

mountLobby(document.body, (match) => {
  journey.phase = "running";
  const status = document.querySelector<HTMLParagraphElement>("#demo-controls p");
  if (status) {
    const crew = match.players.map((player) => player.name).join(", ");
    status.textContent = "Multiplayer crew · " + match.playerCount + "/" + match.teamSize + " · " + crew;
  }
  update();
});
