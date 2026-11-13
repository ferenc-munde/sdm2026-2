// Local dev harness entry. Placeholder scene only — the real carriage
// renderer is #37. Proves: vite serves the client, the schema state ticks
// locally, and Three.js renders.
import {
	BoxGeometry,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
} from "three";
import { createLocalStateModel } from "./stateModel.ts";

const container = document.getElementById("app");
if (!container) throw new Error("#app is missing from index.html");

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);
scene.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial({ color: 0xe0a63c })));

const status = document.getElementById("status");
if (!status) throw new Error("#status is missing from index.html");

const model = createLocalStateModel();
model.onTick((s) => {
	status.textContent =
		`tick ${s.tick} · phase ${s.phase} · power ${s.power.toFixed(0)}% · ` +
		`dist ${(s.journeyDistance * 100).toFixed(1)}% · ` +
		`[WASD/arrows move · E pickup · Q drop]`;
});
model.start();

// Keyboard -> adapter.send — the interim room flow: the adapter stamps
// sessionId + seq and routes each press into step() as an InputEvent.
// Demo item ids until items spawn on the ground (#95).
const DEMO_ITEM_ID = "wrench";
window.addEventListener("keydown", (event) => {
	if (event.repeat && (event.key === "e" || event.key === "q")) return;
	const move = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
		ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, [number, number]>;
	const axis = move[event.key];
	if (axis) {
		model.send({ type: "move", mx: axis[0], my: axis[1], run: event.shiftKey });
		if (event.key.startsWith("Arrow")) event.preventDefault();
	} else if (event.key === "e") {
		model.send({ type: "pickup", itemId: DEMO_ITEM_ID });
	} else if (event.key === "q") {
		model.send({ type: "drop", itemId: DEMO_ITEM_ID });
	}
});

window.addEventListener("resize", () => {
	renderer.setSize(container.clientWidth, container.clientHeight);
	camera.aspect = container.clientWidth / container.clientHeight;
	camera.updateProjectionMatrix();
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
