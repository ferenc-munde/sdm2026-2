import * as THREE from "three";

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
  const names = ["COMMAND", "BOILER", "MECHANICAL", "CARGO", "GENERATOR"];
  const colors = ["#478ca4", "#a56838", "#b49842", "#926b42", "#53846c"];
  for (let i = 0; i < 5; i++) {
    const y = 50 + i * 168;
    rect(683, y + 8, 240, 162, "#161b17");
    rect(690, y, 220, 158, "#6a743b"); rect(698, y + 7, 204, 144, "#232a29");
    for (let tx = 0; tx < 5; tx++) for (let ty = 0; ty < 4; ty++)
      rect(705 + tx * 38, y + 16 + ty * 32, 36, 30, (tx + ty) % 2 ? "#655f51" : "#706657");
    for (const x of [700, 896]) rect(x, y + 45, 4, 42, "#ffd06a");
    for (const x of [720, 818]) {
      rect(x, y + 25, 62, 38, "#242b28"); rect(x + 4, y + 29, 54, 30, colors[i]!);
      rect(x + 10, y + 33, 20, 4, "#cfbc79");
    }
    if (i === 1 || i === 2) {
      rect(723, y + 99, 147, 9, "#292b25"); rect(726, y + 101, 141, 5, "#bd963d");
      c.strokeStyle = "#cb5142"; c.lineWidth = 5;
      c.beginPath(); c.arc(800, y + 102, 12, 0, Math.PI * 2); c.stroke();
    }
    if (i === 3) for (const x of [725, 830]) {
      rect(x, y + 95, 32, 28, "#302b22"); rect(x + 3, y + 98, 26, 22, "#a17b44");
    }
    rect(773, y + 151, 54, 17, "#252b28"); rect(779, y + 153, 42, 11, "#85806b");
    c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillStyle = "#f0d18a";
    c.fillText(`${i + 1} ${names[i]}`, 800, y + 12);
  }
  for (const [x, y, color] of [[790, 140, "#62cdd3"], [850, 455, "#e46c63"], [755, 635, "#e0bc4e"]] as const) {
    rect(x - 9, y + 4, 7, 8, "#192327"); rect(x + 2, y + 4, 7, 8, "#192327");
    rect(x - 11, y - 12, 22, 20, color); rect(x - 10, y - 28, 20, 18, "#e9bc8c");
    rect(x - 12, y - 31, 24, 8, "#69452f");
  }
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
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.domElement.setAttribute("aria-label", "2D top-down train with five carriages and forest tracks");
  container.append(renderer.domElement);
  function resize() {
    const w = container.clientWidth, h = Math.max(1, container.clientHeight), ratio = w / h;
    const height = Math.max(1000, 1600 / ratio);
    camera.left = -height * ratio / 2; camera.right = height * ratio / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
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
    /** Visual multiplier, not a gameplay speed formula. Zero stops the scenery. */
    setSpeed(value: number) { speed = Number.isFinite(value) ? Math.max(0, value) : 0; },
    setPaused(value: boolean) { paused = value; },
    destroy() {
    renderer.setAnimationLoop(null);
    window.removeEventListener("resize", resize); geometry.dispose(); material.dispose();
    landscapeTexture.dispose(); landscapeMaterial.dispose();
    texture.dispose(); renderer.dispose(); renderer.domElement.remove();
  } };
}
