import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, PLAYER_RADIUS } from "../shared/map.ts";
import { TRAIN_CARS, TRAIN_PASSAGES } from "./train-map";

/** What the scene needs to draw one crew member; positions are map units (shared/map.ts). */
export interface ScenePlayer {
  id: string;
  x: number;
  y: number;
  eliminated?: boolean;
}

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
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#292e20");
  const camera = new THREE.OrthographicCamera(-800, 800, 500, -500, 0.1, 10);
  camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(1600, 1000);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const landscapeTexture = new THREE.CanvasTexture(landscape);
  landscapeTexture.wrapT = THREE.RepeatWrapping;
  landscapeTexture.magFilter = THREE.NearestFilter;
  landscapeTexture.minFilter = THREE.NearestFilter;
  landscapeTexture.colorSpace = THREE.SRGBColorSpace;
  const landscapeMaterial = new THREE.MeshBasicMaterial({ map: landscapeTexture });
  const landscapeMesh = new THREE.Mesh(geometry, landscapeMaterial);
  landscapeMesh.position.z = -0.1;
  scene.add(landscapeMesh);
  scene.add(new THREE.Mesh(geometry, material));
  // One disc per player, created and removed as the players map changes.
  const playerGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 24);
  const outlineGeometry = new THREE.CircleGeometry(PLAYER_RADIUS + 3, 24);
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: "#10161a" });
  const selfOutlineMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const playerMarkers = new Map<string, { group: THREE.Group; outline: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  function removeMarker(id: string) {
    const marker = playerMarkers.get(id);
    if (!marker) return;
    scene.remove(marker.group); marker.material.dispose(); playerMarkers.delete(id);
  }
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.domElement.setAttribute("aria-label", "2D top-down train with five carriages and forest tracks");
  container.append(renderer.domElement);
  let focusedCar: number | null = null;
  function resize() {
    const w = container.clientWidth, h = Math.max(1, container.clientHeight), ratio = w / h;
    const height = focusedCar === null ? Math.max(1000, 1600 / ratio) : Math.max(400, 560 / ratio);
    camera.left = -height * ratio / 2; camera.right = height * ratio / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.position.y = focusedCar === null ? 0 : 500 - (TRAIN_CARS[focusedCar]!.bounds.y + 79);
    camera.updateProjectionMatrix(); renderer.setSize(w, h); renderer.render(scene, camera);
  }
  window.addEventListener("resize", resize); resize();
  let speed = 1;
  let paused = false;
  let previousTime: number | undefined;
  renderer.setAnimationLoop((time: number) => {
    const dt = previousTime === undefined ? 0 : Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
    previousTime = time;
    // Presentation only: 1x = 120 artwork pixels/second. Never updates game state.
    if (!paused && !document.hidden) {
      landscapeTexture.offset.y = (landscapeTexture.offset.y + dt * speed * 0.12) % 1;
    }
    renderer.render(scene, camera);
  });
  return {
    /** Inspect approximately two cars; null restores the full map overview. */
    focusCar(index: number | null) {
      focusedCar = index === null ? null : Math.max(0, Math.min(4, Math.floor(index)));
      resize();
    },
    /** Visual multiplier, not a gameplay speed formula. Zero stops the scenery. */
    setSpeed(value: number) { speed = Number.isFinite(value) ? Math.max(0, value) : 0; },
    setPaused(value: boolean) { paused = value; },
    /** Draw the crew: adds a marker for a new player, moves existing ones, removes those who left. */
    setPlayers(players: Iterable<ScenePlayer>, localId?: string) {
      const seen = new Set<string>();
      let seat = 0;
      for (const player of players) {
        seen.add(player.id);
        let marker = playerMarkers.get(player.id);
        if (!marker) {
          const material = new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[seat % PLAYER_COLORS.length], transparent: true });
          const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
          const disc = new THREE.Mesh(playerGeometry, material);
          disc.position.z = 0.1;
          const group = new THREE.Group();
          group.add(outline, disc);
          marker = { group, outline, material };
          playerMarkers.set(player.id, marker);
          scene.add(group);
        }
        // Map units have y pointing down from the top-left corner; the camera looks at the map centre.
        marker.group.position.set(player.x - MAP_WIDTH / 2, MAP_HEIGHT / 2 - player.y, 0.2);
        marker.outline.material = player.id === localId ? selfOutlineMaterial : outlineMaterial;
        marker.material.opacity = player.eliminated ? 0.35 : 1;
        seat += 1;
      }
      for (const id of [...playerMarkers.keys()]) if (!seen.has(id)) removeMarker(id);
    },
    destroy() {
    renderer.setAnimationLoop(null);
    for (const id of [...playerMarkers.keys()]) removeMarker(id);
    playerGeometry.dispose(); outlineGeometry.dispose(); outlineMaterial.dispose(); selfOutlineMaterial.dispose();
    window.removeEventListener("resize", resize); geometry.dispose(); material.dispose();
    landscapeTexture.dispose(); landscapeMaterial.dispose();
    texture.dispose(); renderer.dispose(); renderer.domElement.remove();
  } };
}
