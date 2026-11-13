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
		`dist ${(s.journeyDistance * 100).toFixed(1)}%`;
});
model.start();

window.addEventListener("resize", () => {
	renderer.setSize(container.clientWidth, container.clientHeight);
	camera.aspect = container.clientWidth / container.clientHeight;
	camera.updateProjectionMatrix();
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
