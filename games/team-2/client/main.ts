import { createTrainScene } from "./scene";
import { createHud, type HudTask, type HudJourney } from "./hud";
import { createLocalStateModel, type GameSession } from "./stateModel.ts";
import { hostGame, joinGame, serverAddress, type NetSession } from "./net.ts";
import { createHudStateReader } from "./state-to-hud";
import gameConfig from "../config/game.json";
import { TRAIN_CARS } from "./train-map";
import { mountLobby } from "./lobby";
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
const hud = createHud(document.querySelector<HTMLElement>("#hud")!);
// The offline model also runs behind the lobby until the game room is joined.
const local = createLocalStateModel();
let session: GameSession = local;
let online = false;
let netStatus = offline ? "" : "Not in a game room yet · join through the lobby";
let readHudState = createHudStateReader(gameConfig.tickRate);
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

mapSelect.addEventListener("change", () => {
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
  const view = readHudState(state);
  if (isPreview()) {
    hud.updateTasks(tasks);
    hud.updateGauges({ power: tasks[0]?.current ? 100 : 40, pressure: 35 });
    hud.updateJourney({ ...journey, speed: journey.phase === "running" && !demoPaused ? demoSpeed / 300 : 0 });
    trainScene?.setSpeed(journey.phase === "running" ? demoSpeed : 0);
  } else {
    hud.updateTasks(view.tasks);
    hud.updateGauges(view.gauges);
    hud.updateJourney(view.journey);
    trainScene?.setSpeed(view.speed);
  }
  // The crew is always drawn from the game state, one marker per entry of `players`.
  trainScene?.setPlayers(
    Array.from(state.players, ([id, player]) => ({ id, x: player.x, y: player.y, eliminated: player.eliminated })),
    session.playerId,
  );
  trainScene?.setPaused(developerTools && demoPaused);
  speedLabel.value = `${demoSpeed.toFixed(1)}x`;
  pauseButton.textContent = demoPaused ? "Resume scenery" : "Pause scenery";
  pauseButton.setAttribute("aria-pressed", String(demoPaused));
  status.value = isPreview() ? `EXAMPLE DATA · ${online ? `room ${session.code}` : "no game room"}` : describeSession();
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

// Keyboard → inputs. Movement is hold-to-move: one `move` input whenever the held direction
// (or Shift) changes, and a zero vector on release. The server moves the player every tick.
const moves: Record<string, [number, number]> = {
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
const STOPPED = "0,0,false";
const held = new Set<string>();
let running = false;
let lastMove = STOPPED;
function sendMove() {
  let mx = 0, my = 0;
  for (const key of held) { mx += moves[key]![0]; my += moves[key]![1]; }
  mx = Math.sign(mx); my = Math.sign(my);
  const run = running && (mx !== 0 || my !== 0);
  const next = `${mx},${my},${run}`;
  if (next === lastMove) return;
  lastMove = next;
  session.send({ type: "move", mx, my, run });
}
function releaseKeys() { held.clear(); running = false; sendMove(); }
const keyOf = (event: KeyboardEvent) => event.key.length === 1 ? event.key.toLowerCase() : event.key;
function onKeyDown(event: KeyboardEvent) {
  if (isPreview() || (event.target instanceof HTMLElement &&
    (event.target.closest("input, select, textarea, button") || event.target.isContentEditable))) return;
  const key = keyOf(event);
  running = event.shiftKey;
  if (moves[key]) {
    held.add(key); sendMove();
    event.preventDefault();
  } else if (key === "Shift") sendMove();
  else if (event.repeat) return;
  else if (key === "e") session.send({ type: "pickup", itemId: "wrench" });
  else if (key === "q") session.send({ type: "drop", itemId: "wrench" });
}
function onKeyUp(event: KeyboardEvent) {
  running = event.shiftKey;
  held.delete(keyOf(event));
  sendMove();
}
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", releaseKeys);

/** Swap the offline model for a seat in the game room. */
async function enterGameRoom(connect: () => Promise<NetSession>) {
  netStatus = "Connecting to the game room…";
  update();
  try {
    const next = await connect();
    local.stop();
    session = next; online = true; readHudState = createHudStateReader(gameConfig.tickRate);
    lastMove = STOPPED; sendMove();
    next.onTick(update);
    next.onClosed(() => {
      online = false;
      netStatus = "The connection to the game room ended · reload the page to play again";
      update();
    });
  } catch (error) {
    netStatus = `Could not join the game room (${error instanceof Error ? error.message : String(error)}) · reload to try again`;
    console.error(error);
  }
  update();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, reject);
  });
}

local.onTick(() => { if (session === local) update(); });
reset(); syncMode(); local.start();

let lobby: ReturnType<typeof mountLobby> | undefined;
const directCode = params.get("room");
if (offline) {
  // Offline demo: no lobby, no server.
} else if (directCode) {
  void enterGameRoom(() => joinGame(server, directCode));
} else {
  // Lobby → game room: the lobby host creates the game room and reports its code to the lobby,
  // which passes it on; everybody else joins the game room by that code.
  lobby = mountLobby(document.body, (match) => {
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
}
window.addEventListener("pagehide", () => {
  session.stop(); local.stop();
  window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", releaseKeys);
  lobby?.destroy(); trainScene?.destroy(); hud.destroy();
});
