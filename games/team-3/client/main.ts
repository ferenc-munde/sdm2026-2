// Browser entry point: draws the train and the crew in a Three.js canvas.
//
// This is a hand-check page for the renderer (#10) and the heads-up display
// (#20). The real client gets the state from the room once the platform host
// exists; until then it shows a small demo crew walking through the cars and a
// demo journey counting down, so the bars and the low-fuel colour can be seen.

import { WebGLRenderer } from "three";
import { FUEL_MAX, HULL_MAX, WIN_DISTANCE } from "../shared/constants.ts";
import type { InputMessage } from "../shared/messages.ts";
import { buildTrainScene, fitCameraToMap } from "./trainScene.ts";
import type { RenderPlayer } from "./renderPlayer.ts";
import { CAR_LENGTH, carCentreX } from "./trainMap.ts";
import { createHudBars } from "./hud.ts";
import { hudView } from "./hudModel.ts";
import { createKeyboard, isIdle } from "./keyboard.ts";

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

const train = buildTrainScene(demoPlayers);

const resize = (): void => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  fitCameraToMap(train.camera, train.map, width / height);
};
resize();
window.addEventListener("resize", resize);

const hud = createHudBars(document.body);

// Show what the keyboard sends (#11). The room forwards this message once the
// platform host exists; movement itself is simulated by the server (#7).
const readout = document.createElement("div");
readout.style.cssText =
  "position:fixed;right:16px;bottom:16px;padding:8px 12px;border-radius:8px;" +
  "background:rgba(16,16,24,.78);font:12px system-ui,sans-serif;color:#e6e6ee;" +
  "pointer-events:none;white-space:pre;font-variant-numeric:tabular-nums";
document.body.append(readout);

const describeInput = (message: InputMessage): string => {
  const idle = isIdle(message) ? "  (idle)" : "";
  const interact = message.interacting ? "  interact" : "";
  return `input  dx ${message.direction.dx}  dy ${message.direction.dy}${interact}${idle}`;
};

// The room's socket plugs in here (#12): `sendInput` becomes `socket.send`,
// and the readout is only the stand-in until the platform host exists.
const sendInput = (message: InputMessage): void => {
  readout.textContent = describeInput(message);
};

const keyboard = createKeyboard({ onChange: sendInput });
readout.textContent = describeInput(keyboard.current());

// Walk the crew along their car and drain a demo journey so it is obvious that
// the scene and the bars follow the state.
const walk = (time: number): void => {
  const seconds = time / 1000;
  const moved = demoPlayers.map((player, seat) => {
    const base = carCentreX(seat);
    const offset = Math.sin(seconds * 0.8 + seat) * (CAR_LENGTH / 3);
    return { ...player, position: { x: base + offset, y: player.position.y } };
  });
  train.updatePlayers(moved);

  // A ~3 minute run: fuel and hull fall, distance grows.
  const progress = (seconds % 180) / 180;
  hud.update(
    hudView({
      fuel: Math.max(0, FUEL_MAX - seconds * 0.6),
      hull: Math.max(0, HULL_MAX - seconds * 0.3),
      distance: progress * WIN_DISTANCE,
      speedFactor: 1,
    }),
  );

  renderer.render(train.scene, train.camera);
  requestAnimationFrame(walk);
};
requestAnimationFrame(walk);
