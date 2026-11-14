// Browser entry point: draws the platform or the train and the crew in a Three.js canvas.
//
// By default this is the real game (#220): the main menu creates or joins a room on the game
// server (`pnpm run server`), and every frame draws the room's state (`readView`, #209).
// With `?demo` in the address it is the hand-check page instead: a demo crew and journey,
// a mock waiting room, and buttons for the end screens and sounds, with no server needed.

import { createConductor } from "./conductor.ts";
import { COURSE_FX_SECONDS, courseFailed, courseFx, failureDirection } from "./courseFx.ts";
import { createHelp } from "./help.ts";
import { createCourseWarning } from "./courseWarning.ts";
import { WebGLRenderer } from "three";
import { FUEL_MAX, HULL_MAX, LOW_FUEL_THRESHOLD, WIN_DISTANCE } from "../shared/constants.ts";
import type { ClientMessage, InputMessage } from "../shared/messages.ts";
import type { GameState, Phase } from "../shared/types.ts";
import { CAR_LENGTH, carCentreX } from "../shared/map/map.ts";
import { buildTrainScene, fitCameraToMap, type RenderHazard, type RenderItem } from "./trainScene.ts";
import type { RenderPlayer } from "./renderPlayer.ts";
import { createHudBars } from "./hud.ts";
import { hudView } from "./hudModel.ts";
import { createKeyboard, isEditableTarget, isIdle } from "./keyboard.ts";
import { createLobby } from "./lobby.ts";
import { buildPlatformScene, fitCameraToPlatform } from "./platformScene.ts";
import { createEndScreen } from "./screens.ts";
import { buildScenery } from "./scenery.ts";
import { createMuteButton, createSoundPlayer, eventsBetween, type SoundName } from "./sound.ts";
import { createWaitingRoom } from "./waitingRoom.ts";
import { waitingView } from "./waitingRoomModel.ts";
import { platformSpawn } from "../shared/map/platform.ts";
import { errorText } from "./lobbyModel.ts";
import { createActionKeys } from "./actionKeys.ts";
import { createRoom, joinRoomByCode, serverAddress, type RoomConnection } from "./roomConnection.ts";
import { joinErrorText } from "./roomLinks.ts";
import { createSharedLinkJoin } from "./sharedLinkJoin.ts";

/** `?demo` opens the hand-check page; otherwise the page plays a real room. */
const demo = new URLSearchParams(window.location.search).has("demo");
const server = serverAddress(window.location, import.meta.env?.VITE_SERVER_URL as string | undefined, import.meta.env?.DEV === true);
import { createPlatformBoard } from "./platformBoard.ts";

const container = document.getElementById("app");
if (!container) throw new Error("#app is missing from index.html");

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const demoPlayers: RenderPlayer[] = [
  { id: "p1", name: "Driver", position: { x: carCentreX(0), y: 40 } },
  { id: "p2", name: "Stoker", position: { x: carCentreX(1), y: -40 } },
  { id: "p3", name: "Mechanic", position: { x: carCentreX(2), y: 30 } },
];

// Everything the state can contain: items on the floor, one in a hand, a fire
// and a breach with their repair bars (#19).
const demoItems: RenderItem[] = [
  { id: "item-wrench", kind: "wrench", position: { x: carCentreX(1) + 60, y: 70 }, heldBy: null },
  { id: "item-coal", kind: "coal", position: { x: carCentreX(2), y: 0 }, heldBy: null },
  { id: "item-extinguisher", kind: "extinguisher", position: { x: carCentreX(0), y: 0 }, heldBy: "p1" },
];
const demoHazards: RenderHazard[] = [
  { id: "hazard-fire", kind: "fire", position: { x: carCentreX(1), y: 55 }, progress: 0 },
  { id: "hazard-breach", kind: "breach", position: { x: carCentreX(2), y: -55 }, progress: 0.5 },
];

const train = buildTrainScene({ players: demoPlayers, items: demoItems, hazards: demoHazards });

// The ground and sleepers that scroll past the train (#25).
const carXs = train.map.cars.map((car) => car.x);
const scenery = buildScenery({
  left: Math.min(...carXs) - CAR_LENGTH / 2,
  right: Math.max(...carXs) + CAR_LENGTH / 2,
  depth: Math.max(...train.map.cars.map((car) => car.depth)),
});
train.scene.add(scenery.group);

// The waiting platform (#146) and its crew, drawn while the room is in the lobby.
const platformScene = buildPlatformScene();
const platformBoard = createPlatformBoard(document.body);

const resize = (): void => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  fitCameraToMap(train.camera, train.map, width / height);
  fitCameraToPlatform(platformScene.camera, platformScene.map, width / height);
};
resize();
window.addEventListener("resize", resize);

const hud = createHudBars(document.body);
const courseWarning = createCourseWarning(document.body);
const conductor = createConductor(document.body);
const help = createHelp(document.body, () => keyboard.reset());
help.update("lobby");

// The connection to the room (#220); null in the menu and on the demo page.
let connection: RoomConnection | null = null;
const sendToRoom = (message: ClientMessage): void => connection?.send(message);
/** The mock room's code on the demo page only. */
const DEMO_ROOM_CODE = "K7QF";

const lobby = createLobby(document.body, {
  onCreate: (name) => {
    if (demo) return enterWaiting(DEMO_ROOM_CODE);
    lobby.setStatus("Creating a room…");
    createRoom(server, name).then(enterLive, () => lobby.setStatus(joinErrorText("connectionFailed")));
  },
  onJoin: (name, code) => {
    if (demo) return enterWaiting(code);
    lobby.setStatus("Joining the room…");
    void joinRoomByCode(server, code, name).then((result) => {
      if (result.ok) enterLive(result.connection);
      else if (result.error === "connectionFailed") lobby.setStatus(joinErrorText(result.error));
      else lobby.updateError(result.error);
    });
  },
});

// Opening a shared link (`?room=CODE`, #147) goes straight to "enter your name, then join".
if (!demo) {
  const linked = createSharedLinkJoin(document.body, {
    address: window.location.href,
    join: async (name, code) => {
      const result = await joinRoomByCode(server, code, name);
      if (!result.ok) return { ok: false, error: result.error };
      enterLive(result.connection);
      return { ok: true };
    },
    onMainMenu: (message) => {
      lobby.show();
      if (message) lobby.setStatus(message);
    },
    onJoined: () => {},
  });
  if (linked) lobby.hide();
}

// Sound effects (#31): the player and its mute button.
const sound = createSoundPlayer();
createMuteButton(document.body, sound);

// Show what the keyboard sends (#11). The room forwards this message once the
// platform host exists; movement itself is simulated by the server (#7).
const readout = document.createElement("div");
readout.style.cssText =
  "position:fixed;right:16px;bottom:16px;padding:8px 12px;border-radius:8px;" +
  "background:rgba(16,16,24,.78);font:12px system-ui,sans-serif;color:#e6e6ee;" +
  "pointer-events:none;white-space:pre;font-variant-numeric:tabular-nums";
if (demo) document.body.append(readout);

const describeInput = (message: InputMessage): string => {
  const idle = isIdle(message) ? "  (idle)" : "";
  const interact = message.interacting ? "  interact" : "";
  return `input  dx ${message.direction.dx}  dy ${message.direction.dy}${interact}${idle}`;
};

// The room's socket plugs in here (#12): `sendInput` becomes `socket.send`,
// and the readout is only the stand-in until the platform host exists.
const sendInput = (message: InputMessage): void => {
  readout.textContent = describeInput(message);
  sendToRoom(message);
};

// The action keys from the design (#220): tap E or left-click to pick up / drop, Shift or F to
// throw; holding E (or Space) is "interact" in the keyboard bindings.
const onAction = createActionKeys(sendToRoom);
window.addEventListener("keydown", (event) => {
  if (!connection || isEditableTarget(event.target)) return;
  onAction({ kind: "keydown", code: event.code, repeat: event.repeat, time: performance.now() });
});
window.addEventListener("keyup", (event) => {
  if (!connection || isEditableTarget(event.target)) return;
  onAction({ kind: "keyup", code: event.code, time: performance.now() });
});
renderer.domElement.addEventListener("mousedown", (event) => {
  if (connection) onAction({ kind: "click", button: event.button });
});

const keyboard = createKeyboard({ onChange: sendInput });
readout.textContent = describeInput(keyboard.current());

// The demo run and its end screens (#21). The real client shows the screen from
// `state.phase`; the two buttons below show either screen without waiting for
// the ~3 minute demo run to finish.
let demoPhase: Phase = "playing";
let demoStart = 0;

const endScreen = createEndScreen(document.body, {
  onPlayAgain: () => {
    if (connection) return sendToRoom({ type: "playAgain" });
    demoStart = performance.now();
    demoPhase = "playing";
    endScreen.update("playing");
    help.update("playing");
  },
});

const demoBar = document.createElement("div");
demoBar.style.cssText =
  "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;" +
  "font:12px system-ui,sans-serif";
const addDemoButton = (label: string, phase: Phase): void => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText =
    "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);" +
    "background:rgba(16,16,24,.8);color:#e6e6ee;cursor:pointer;font:inherit";
  button.addEventListener("click", () => {
    demoPhase = phase;
    endScreen.update(phase);
    if (previousDemoState) courseWarning.update({ ...previousDemoState, phase });
    if (previousDemoState) conductor.update({ ...previousDemoState, phase });
    help.update(phase);
  });
  demoBar.append(button);
};
addDemoButton("Show win screen", "won");
addDemoButton("Show lose screen", "lost");

// Course-hazard feedback (#219): a failed event shakes the camera and rolls the hull.
let fxStart: number | null = null;
let fxDirection: 1 | -1 = 1;
let fxBase: { x: number; y: number; z: number } | null = null;

function triggerCourseFx(direction: 1 | -1): void {
  fxStart = performance.now();
  fxDirection = direction;
  fxBase = { x: train.camera.position.x, y: train.camera.position.y, z: train.camera.position.z };
}

function applyCourseFx(time: number): void {
  if (fxStart === null) return;
  const elapsed = (time - fxStart) / 1000;
  const view = courseFx(elapsed, fxDirection);
  if (fxBase) train.camera.position.set(fxBase.x + view.shakeX, fxBase.y + view.shakeY, fxBase.z);
  // The train runs along x, so a sideways lurch (the rules push across the track) is a roll around x.
  train.hullGroup.rotation.x = view.tilt;
  if (elapsed >= COURSE_FX_SECONDS) {
    fxStart = null;
    train.hullGroup.rotation.x = 0;
    resize();
  }
}

const courseButton = document.createElement("button");
courseButton.type = "button";
courseButton.textContent = "Course fail";
courseButton.style.cssText =
  "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);" +
  "background:rgba(16,16,24,.8);color:#e6e6ee;cursor:pointer;font:inherit";
courseButton.addEventListener("click", () => triggerCourseFx(1));
demoBar.append(courseButton);

if (demo) document.body.append(demoBar);

// One button per sound, so every cue can be checked by hand.
const soundBar = document.createElement("div");
soundBar.style.cssText =
  "position:fixed;left:50%;bottom:52px;transform:translateX(-50%);display:flex;gap:8px;" +
  "font:12px system-ui,sans-serif";
const addSoundButton = (label: string, name: SoundName): void => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText =
    "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);" +
    "background:rgba(16,16,24,.8);color:#e6e6ee;cursor:pointer;font:inherit";
  button.addEventListener("click", () => sound.play(name));
  soundBar.append(button);
};
addSoundButton("Hazard", "hazard");
addSoundButton("Repair", "repairDone");
addSoundButton("Low fuel", "lowFuel");
addSoundButton("Win", "win");
addSoundButton("Lose", "lose");
if (demo) document.body.append(soundBar);

// The waiting room (#146): the crew on the platform. The room state will come from the
// platform room (#80, via roomView in #198); until then a mock room with two crewmates drives the screen.
const me = "p1";
let mockState: GameState | null = null;
let waitingMode = false;
hud.root.hidden = true;

function mockRoom(code: string): GameState {
  const names = ["You", "Bela", "Cem"];
  const players: GameState["players"] = {};
  names.forEach((name, seat) => {
    const id = `p${seat + 1}`;
    players[id] = {
      id,
      name,
      position: platformSpawn(platformScene.map, seat),
      facing: { dx: 1, dy: 0 },
      heldItem: null,
      connected: true,
    };
  });
  return {
    roomCode: code,
    phase: "lobby",
    lobby: { hostId: me, crewSize: names.length },
    time: 0,
    players,
    items: {},
    hazards: {},
    journey: { fuel: 100, hull: 100, distance: 0, speedFactor: 1 },
  };
}

function enterWaiting(code: string): void {
  lobby.hide();
  waitingMode = true;
  mockState = mockRoom(code);
  platformScene.updatePlayers(Object.values(mockState.players));
  platformBoard.update(mockState, me, platformScene.map.objects);
  waiting.update(waitingView(mockState, me));
  waiting.show();
  hud.root.hidden = true;
  help.update("lobby");
}

const waiting = createWaitingRoom(document.body, {
  onSize: (size) => {
    if (connection) return sendToRoom({ type: "configureRoom", crewSize: size });
    if (!mockState) return;
    mockState = { ...mockState, lobby: { ...mockState.lobby, crewSize: size } };
    waiting.update(waitingView(mockState, me));
    platformBoard.update(mockState, me, platformScene.map.objects);
  },
  onDepart: () => {
    if (connection) return sendToRoom({ type: "startGame" });
    if (!mockState) return;
    if (!waitingView(mockState, me).canDepart) return;
    waiting.hide();
    platformBoard.hide();
    waitingMode = false;
    demoStart = performance.now();
    previousDemoState = null;
    demoPhase = "playing";
    endScreen.update("playing");
    help.update("playing");
    hud.root.hidden = false;
  },
  onLeave: () => {
    if (connection) return void leaveLive();
    waiting.hide();
    platformBoard.hide();
    waitingMode = false;
    mockState = null;
    platformScene.updatePlayers([]);
    hud.root.hidden = true;
    lobby.reset();
    lobby.show();
    help.update("lobby");
  },
});

// --- The real room (#220) ---

// A short line for the room's refusals (not host, crew incomplete, …).
const toast = document.createElement("div");
toast.setAttribute("role", "status");
toast.style.cssText =
  "position:fixed;left:50%;top:96px;transform:translateX(-50%);padding:8px 14px;border-radius:8px;" +
  "background:rgba(16,16,24,.9);color:#ffd0a8;font:14px system-ui,sans-serif;z-index:35;pointer-events:none";
toast.hidden = true;
document.body.append(toast);
let toastTimer = 0;
function showToast(text: string): void {
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3000);
}

let liveState: GameState | null = null;
let lastNotice = 0;

function enterLive(next: RoomConnection): void {
  connection = next;
  liveState = null;
  lastNotice = 0;
  next.onClosed(() => backToMenu("The connection to the room was lost."));
  lobby.hide();
  hud.root.hidden = true;
}

function backToMenu(message?: string): void {
  connection = null;
  liveState = null;
  waiting.hide();
  platformBoard.hide();
  platformScene.updatePlayers([]);
  hud.root.hidden = true;
  endScreen.update("lobby");
  help.update("lobby");
  lobby.reset();
  lobby.show();
  if (message) lobby.setStatus(message);
}

async function leaveLive(): Promise<void> {
  const leaving = connection;
  backToMenu();
  await leaving?.leave().catch(() => undefined);
}

/** Draws one frame of the real room and keeps the screens in step with its phase. */
function drawLive(delta: number, time: number): void {
  const live = connection!;
  const state = live.view();
  const notice = live.notice();

  if (notice && notice.n !== lastNotice) {
    lastNotice = notice.n;
    // Refused before getting a seat (room full for the crew size, run already started): back to the menu.
    if (!state?.players[live.me]) {
      void leaveLive().then(() => lobby.updateError(notice.error));
      return;
    }
    showToast(notice.message ?? errorText(notice.error));
  }
  if (!state || !state.players[live.me]) {
    renderer.render(platformScene.scene, platformScene.camera);
    return;
  }

  const phaseChanged = liveState?.phase !== state.phase;
  if (state.phase === "lobby") {
    if (phaseChanged) {
      hud.root.hidden = true;
      endScreen.update("lobby");
      help.update("lobby");
      waiting.show();
    }
    platformScene.updatePlayers(Object.values(state.players));
    waiting.update(waitingView(state, live.me));
    platformBoard.update(state, live.me, platformScene.map.objects);
    liveState = state;
    renderer.render(platformScene.scene, platformScene.camera);
    return;
  }

  if (phaseChanged) {
    waiting.hide();
    platformBoard.hide();
    hud.root.hidden = false;
    endScreen.update(state.phase);
    help.update(state.phase);
  }
  train.updateState({
    players: Object.values(state.players),
    items: Object.values(state.items),
    hazards: Object.values(state.hazards),
  });
  hud.update(hudView(state.journey));
  scenery.update(delta, state.phase === "playing" ? state.journey.speedFactor : 0);
  if (liveState && liveState.phase !== "lobby") {
    for (const name of eventsBetween(liveState, state)) sound.play(name);
  }
  courseWarning.update(state);
  conductor.update(state);
  if (liveState && liveState.phase !== "lobby" && courseFailed(liveState, state)) {
    triggerCourseFx(failureDirection(liveState, state));
  }
  liveState = state;
  applyCourseFx(time);
  renderer.render(train.scene, train.camera);
}

// Walk the crew along their car and drain a demo journey so it is obvious that
// the scene, the bars, the end screens and the scenery follow the state.
let lastTime: number | null = null;
let previousDemoState: GameState | null = null;
const walk = (time: number): void => {
  // Clamp the frame time so a tab switch does not make the scenery jump.
  const delta = lastTime === null ? 0 : Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;

  if (connection) {
    drawLive(delta, time);
    requestAnimationFrame(walk);
    return;
  }
  if (!demo) {
    // The main menu: show the empty platform behind it.
    renderer.render(platformScene.scene, platformScene.camera);
    requestAnimationFrame(walk);
    return;
  }

  // While the crew waits, draw the platform instead of the train (#146).
  if (waitingMode) {
    if (mockState) platformBoard.update(mockState, me, platformScene.map.objects);
    renderer.render(platformScene.scene, platformScene.camera);
    requestAnimationFrame(walk);
    return;
  }

  if (demoPhase === "playing") {
    const seconds = (time - demoStart) / 1000;
    const moved = demoPlayers.map((player, seat) => {
      const base = carCentreX(seat);
      const offset = Math.sin(seconds * 0.8 + seat) * (CAR_LENGTH / 3);
      return { ...player, position: { x: base + offset, y: player.position.y } };
    });

    // Repair progress moves so the bars can be seen following the state (#19).
    const hazards = demoHazards.map((hazard, index) => ({
      ...hazard,
      progress: (Math.sin(seconds * 0.7 + index) + 1) / 2,
    }));
    train.updateState({ players: moved, items: demoItems, hazards });

    // A ~3 minute run: fuel and hull fall, distance grows, then the win screen.
    // The train slows at low fuel and stops when the tank is empty (#25).
    const fuel = Math.max(0, FUEL_MAX - seconds * 0.6);
    const hull = Math.max(0, HULL_MAX - seconds * 0.3);
    const speedFactor = fuel <= 0 ? 0 : fuel <= LOW_FUEL_THRESHOLD ? 0.5 : 1;
    const progress = Math.min(1, seconds / 180);
    const journey = { fuel, hull, distance: progress * WIN_DISTANCE, speedFactor };
    hud.update(hudView(journey));
    scenery.update(delta, speedFactor);

    // Sound cues come from diffing the states, exactly as they will in the room.
    const demoState: GameState = {
      roomCode: "DEMO",
      phase: "playing",
      lobby: { hostId: null, crewSize: 4 },
      time: seconds,
      players: {},
      items: {},
      hazards: Object.fromEntries(
        hazards.map((hazard) => [
          hazard.id,
          {
            id: hazard.id,
            kind: hazard.kind,
            car: 0,
            spotId: hazard.id,
            position: hazard.position,
            age: 0,
            progress: hazard.progress,
            countdown: null,
          },
        ]),
      ),
      journey,
    };
    if (previousDemoState) {
      for (const name of eventsBetween(previousDemoState, demoState)) sound.play(name);
    }
    courseWarning.update(demoState);
    conductor.update(demoState);
    if (previousDemoState && courseFailed(previousDemoState, demoState)) {
      triggerCourseFx(failureDirection(previousDemoState, demoState));
    }
    previousDemoState = demoState;

    if (progress >= 1) {
      demoPhase = "won";
      endScreen.update("won");
      courseWarning.update({ ...demoState, phase: "won" });
      conductor.update({ ...demoState, phase: "won" });
      help.update("won");
    }
  }


  applyCourseFx(time);
  renderer.render(train.scene, train.camera);
  requestAnimationFrame(walk);
};
requestAnimationFrame(walk);
