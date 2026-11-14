import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, PLAYER_RADIUS } from "../shared/map.ts";
import type { Item, Player } from "../shared/state.ts";
import { createPlayerVisuals } from "./player-visuals";
import { createItemVisuals } from "./item-visuals";
import { TRAIN_CARS, TRAIN_PASSAGES } from "./train-map";
import { followFrame, localCameraTarget, smoothCameraY, type CameraTarget } from "./camera-framing";

/** One colour per seat, in the order players joined (same order as the lobby avatars). */
export const PLAYER_COLORS = ["#62cdd3", "#e46c63", "#e0bc4e", "#6f9bea"] as const;

/** Flat top-down artwork displayed with Three.js, without 3D perspective. */
export function createTrainScene(container: HTMLElement) {
  const art = document.createElement("canvas");
  art.width = 1600; art.height = 1000;
  const c = art.getContext("2d")!;
  function rect(x: number, y: number, w: number, h: number, color: string) {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  }
  rect(0, 0, 1600, 1000, "#292e20");
  for (let i = 0; i < 1400; i++) rect(i * 139 % 1600, i * 227 % 1000, 7, 5, i % 2 ? "#343b26" : "#22291c");
  for (const x of [440, 800, 1160]) {
    for (let y = 0; y < 1000; y += 25) {
      rect(x - 68, y, 136, 12, "#151a17"); rect(x - 64, y, 128, 7, "#65503a");
    }
    for (const dx of [-48, 48]) {
      rect(x + dx - 4, 0, 12, 1000, "#161a18"); rect(x + dx, 0, 4, 1000, "#8a8b77");
    }
  }
  for (let i = 0; i < 65; i++) {
    const x = (i * 293 + 90) % 1600, y = (i * 181 + 40) % 1000;
    if ([440, 800, 1160].some(track => Math.abs(x - track) < 140)) continue;
    rect(x - 5, y, 10, 50, "#453a29");
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = ["#172b1c", "#29442a", "#40582c"][layer]!;
      c.beginPath(); c.moveTo(x, y - 55 + layer * 16);
      c.lineTo(x - 37 + layer * 5, y + 14 + layer * 13);
      c.lineTo(x + 37 - layer * 5, y + 14 + layer * 13); c.fill();
    }
  }
  // Separate scrolling scenery from the train and crew, which stay in place.
  const landscape = document.createElement("canvas");
  landscape.width = art.width; landscape.height = art.height;
  landscape.getContext("2d")!.drawImage(art, 0, 0);
  c.clearRect(0, 0, art.width, art.height);
  for (const car of TRAIN_CARS) {
    const i = car.index;
    const y = car.bounds.y;
    rect(683, y + 8, 240, 162, "#161b17");
    rect(690, y, 220, 158, "#6a743b"); rect(698, y + 7, 204, 144, "#232a29");
    for (let tx = 0; tx < 5; tx++) for (let ty = 0; ty < 4; ty++)
      rect(705 + tx * 38, y + 16 + ty * 32, 36, 30, car.floor);
    for (const x of [700, 896]) rect(x, y + 45, 4, 42, "#ffd06a");
    for (const station of car.stations) {
      const { x, y: sy, color } = station;
      rect(x - 2, sy - 2, 62, 34, "#242b28");
      rect(x, sy, 58, 30, color);
      if (station.id.startsWith("nav")) {
        rect(x + 5, sy + 3, 48, 14, "#183c52");
        rect(x + 10, sy + 7, 22, 3, "#8ee0d4");
      } else if (station.id === "boiler" || station.id === "generator-crank") {
        rect(x + 5, sy + 3, 46, 13, "#313b39");
        for (let n = 0; n < 4; n++) rect(x + 10 + n * 9, sy + 5, 3, 10, "#9ca79d");
      } else if (station.id.includes("valve") || station.id === "pipe-junction") {
        rect(x + 3, sy + 8, 52, 5, "#d7b55b");
        c.strokeStyle = "#a43730"; c.lineWidth = 3;
        c.beginPath(); c.arc(x + 29, sy + 10, 7, 0, Math.PI * 2); c.stroke();
      } else {
        rect(x + 6, sy + 4, 46, 10, "#323d36");
      }
      c.font = "bold 7px monospace"; c.textAlign = "center"; c.fillStyle = "#fff1ca";
      c.fillText(station.label, x + 29, sy + 25);
    }
    // Top/bottom wall openings line up with the central aisle.
    if (i > 0) rect(778, y, 44, 17, car.floor);
    if (i < 4) rect(778, y + 140, 44, 18, car.floor);
    c.font = "bold 9px monospace"; c.textAlign = "center"; c.fillStyle = "#f0d18a";
    c.fillText(`${i + 1} ${car.name.toUpperCase()}`, 800, y + 23);
  }
  for (const passage of TRAIN_PASSAGES) {
    const { x, y, width, height } = passage.bounds;
    rect(x - 4, y, width + 8, height, "#1d2523");
    rect(x, y, width, height, "#8a8875");
    for (let n = 0; n < 6; n++) rect(x, y + n * 7, width, 2, "#676f63");
    // Retracted bulkhead door leaves flank the open passage.
    rect(x - 6, y + 8, 6, 18, "#e4b552");
    rect(x + width, y + 8, 6, 18, "#e4b552");
    const hatch = passage.hatch;
    rect(hatch.x, hatch.y, hatch.width, hatch.height, "#343e3a");
    rect(hatch.x + 4, hatch.y + 4, hatch.width - 8, hatch.height - 8, "#d0ba78");
  }
  // The crew is not painted here: setPlayers() draws one marker per player from the game state.
  const texture = new THREE.CanvasTexture(art);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const backgroundScene = new THREE.Scene();
  backgroundScene.background = new THREE.Color("#292e20");
  const backgroundCamera = new THREE.OrthographicCamera(-800, 800, 500, -500, 0.1, 10);
  backgroundCamera.position.z = 2;
  const camera = new THREE.OrthographicCamera(-800, 800, 500, -500, 0.1, 10);
  camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(1600, 1000);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const landscapeTexture = new THREE.CanvasTexture(landscape);
  landscapeTexture.wrapT = THREE.RepeatWrapping;
  landscapeTexture.wrapS = THREE.RepeatWrapping;
  landscapeTexture.magFilter = THREE.NearestFilter;
  landscapeTexture.minFilter = THREE.NearestFilter;
  landscapeTexture.colorSpace = THREE.SRGBColorSpace;
  const landscapeMaterial = new THREE.MeshBasicMaterial({ map: landscapeTexture });
  const landscapeMesh = new THREE.Mesh(geometry, landscapeMaterial);
  landscapeMesh.position.z = -0.1;
  backgroundScene.add(landscapeMesh);
  scene.add(new THREE.Mesh(geometry, material));
  // Layers for player and item visuals, added to the scene so the modules
  // can manage their own children without touching the rest of the scene graph.
  const playerLayer = new THREE.Group();
  const itemLayer = new THREE.Group();
  scene.add(playerLayer);
  scene.add(itemLayer);
  const playerVisuals = createPlayerVisuals(playerLayer);
  const itemVisuals = createItemVisuals(itemLayer, (id) => playerVisuals.getCarryAnchor(id));
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.autoClear = false;
  renderer.domElement.setAttribute("aria-label", "2D top-down train with five carriages and forest tracks");
  container.append(renderer.domElement);
  let focusedCar: number | null = null;
  let followLocalPlayer = true;
  let followTarget: CameraTarget | null = null;
  let followedId: string | undefined;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let viewportWidth = 1, viewportHeight = 1, playHeight = 1;
  function render() {
    // Draw one continuous moving landscape across the entire page.
    renderer.setViewport(0, 0, viewportWidth, viewportHeight);
    renderer.clear();
    renderer.render(backgroundScene, backgroundCamera);
    // Only train/players reserve the HUD area, so the first car stays visible.
    renderer.clearDepth();
    renderer.setViewport(0, 0, viewportWidth, playHeight);
    renderer.render(scene, camera);
  }
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    const hudTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hud-safe-top")) || 140;
    viewportWidth = w; viewportHeight = h;
    playHeight = Math.max(1, h - Math.min(hudTop, h - 1));
    const ratio = w / playHeight;
    const frame = followLocalPlayer && followTarget ? followFrame(followTarget, ratio) : null;
    const height = frame?.height ?? (focusedCar === null ? Math.max(1000, 1600 / ratio) : Math.max(400, 560 / ratio));
    camera.left = -height * ratio / 2; camera.right = height * ratio / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.position.x = frame ? frame.centerX - MAP_WIDTH / 2 : 0;
    camera.position.y = frame ? MAP_HEIGHT / 2 - frame.centerY : focusedCar === null ? 0 : 500 - (TRAIN_CARS[focusedCar]!.bounds.y + 79);
    camera.updateProjectionMatrix();
    const fullHeight = height * h / playHeight;
    const fullWidth = height * ratio;
    backgroundCamera.left = -fullWidth / 2; backgroundCamera.right = fullWidth / 2;
    backgroundCamera.top = fullHeight / 2; backgroundCamera.bottom = -fullHeight / 2;
    backgroundCamera.updateProjectionMatrix();
    landscapeMesh.scale.set(fullWidth / 1600, fullHeight / 1000, 1);
    landscapeTexture.repeat.set(fullWidth / 1600, fullHeight / 1000);
    landscapeTexture.offset.x = (1 - fullWidth / 1600) / 2;
    renderer.setSize(w, h); render();
  }
  const viewportObserver = new ResizeObserver(resize);
  viewportObserver.observe(container);
  const hudObserver = new MutationObserver(resize);
  hudObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  window.addEventListener("resize", resize); resize();
  let speed = 1;
  let paused = false;
  let previousTime: number | undefined;
  renderer.setAnimationLoop((time: number) => {
    const dt = previousTime === undefined ? 0 : Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
    previousTime = time;
    if (followLocalPlayer && followTarget) {
      const frame = followFrame(followTarget, viewportWidth / playHeight);
      const y = MAP_HEIGHT / 2 - frame.centerY;
      camera.position.y = reduceMotion ? y : smoothCameraY(camera.position.y, y, dt);
    }
    // Presentation only: 1x = 120 artwork pixels/second. Never updates game state.
    if (!paused && !document.hidden) {
      landscapeTexture.offset.y = (landscapeTexture.offset.y + dt * speed * 0.12) % 1;
    }
    render();
  });
  return {
    /** Inspect approximately two cars; null restores the full map overview. */
    focusCar(index: number | null) {
      followLocalPlayer = false;
      focusedCar = index === null ? null : Math.max(0, Math.min(4, Math.floor(index)));
      resize();
    },
    /** Normal gameplay: each client follows only its own session player. */
    followPlayer() {
      followLocalPlayer = true;
      focusedCar = null;
      resize();
    },
    /** Visual multiplier, not a gameplay speed formula. Zero stops the scenery. */
    setSpeed(value: number) { speed = Number.isFinite(value) ? Math.max(0, value) : 0; },
    setPaused(value: boolean) { paused = value; },
    /** Draw the crew from the game state, delegated to the player-visuals module. */
    setPlayers(players: Iterable<[string, Player]>, localId?: string) {
      const entries = Array.from(players);
      const nextTarget = localCameraTarget(entries, localId);
      const reframe = followedId !== localId || Boolean(nextTarget) !== Boolean(followTarget);
      followTarget = nextTarget;
      followedId = localId;
      playerVisuals.update(entries, localId);
      if (followLocalPlayer && reframe) resize();
    },
    /** Draw items from the game state, delegated to the item-visuals module. */
    setItems(items: Iterable<[string, Item]>) {
      itemVisuals.update(items);
    },
    destroy() {
    renderer.setAnimationLoop(null);
    viewportObserver.disconnect();
    hudObserver.disconnect();
    playerVisuals.destroy();
    itemVisuals.destroy();
    window.removeEventListener("resize", resize); geometry.dispose(); material.dispose();
    landscapeTexture.dispose(); landscapeMaterial.dispose();
    texture.dispose(); renderer.dispose(); renderer.domElement.remove();
  } };
}
