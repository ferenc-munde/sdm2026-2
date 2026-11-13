import * as THREE from "three";
import type { GameClientSnapshot } from "./game-state-adapter.mjs";
import { toPlayerViewModels } from "./presentation-model.mjs";

export type TrainScene = {
  update(snapshot: GameClientSnapshot): void;
  dispose(): void;
};

export type SceneRendererFactory = (
  canvas: HTMLCanvasElement,
) => Pick<THREE.WebGLRenderer, "setPixelRatio" | "setSize" | "render" | "dispose">;

export function mountTrainScene(
  canvas: HTMLCanvasElement,
  fallback: HTMLElement,
  createRenderer: SceneRendererFactory = (target) => new THREE.WebGLRenderer({ canvas: target, antialias: true, alpha: false }),
): TrainScene {
  let renderer: ReturnType<SceneRendererFactory>;
  try {
    renderer = createRenderer(canvas);
  } catch {
    fallback.hidden = false;
    canvas.hidden = true;
    return { update: () => undefined, dispose: () => undefined };
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#182124");
  scene.fog = new THREE.Fog("#182124", 18, 42);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  camera.position.set(10, 12, 15);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight("#d8d4c8", "#202a2d", 2.2));
  const keyLight = new THREE.DirectionalLight("#f2d5a2", 3.4);
  keyLight.position.set(-5, 10, 6);
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: "#3a4140", roughness: 0.85 }),
  );
  floor.position.y = -0.18;
  scene.add(floor);

  const railMaterial = new THREE.MeshStandardMaterial({ color: "#b18e57", metalness: 0.55, roughness: 0.42 });
  for (const z of [-0.52, 0.52]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.09), railMaterial);
    rail.position.set(0, -0.01, z);
    scene.add(rail);
  }
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: "#252d2d", roughness: 0.9 });
  for (let x = -6.5; x <= 6.5; x += 0.9) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 1.5), sleeperMaterial);
    sleeper.position.set(x, -0.04, 0);
    scene.add(sleeper);
  }

  const carriageFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(14.2, 3.8, 7.2)),
    new THREE.LineBasicMaterial({ color: "#77817c", transparent: true, opacity: 0.72 }),
  );
  carriageFrame.position.y = 1.75;
  scene.add(carriageFrame);

  const playerGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 12);
  const headGeometry = new THREE.SphereGeometry(0.25, 14, 10);
  const sharedPlayerGeometries = new Set([playerGeometry, headGeometry]);
  const playerMeshes = new Map<string, THREE.Group>();

  function createPlayer(color: string): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
    const body = new THREE.Mesh(playerGeometry, material);
    body.position.y = 0.54;
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 1.15;
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.39, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.015;
    group.add(body, head, marker);
    return group;
  }

  function disposePlayerResources(group: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!sharedPlayerGeometries.has(object.geometry)) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let frame = 0;
  const draw = () => {
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  draw();

  return {
    update(snapshot) {
      const players = toPlayerViewModels(snapshot);
      const visible = new Set(players.map((player) => player.id));
      for (const [id, group] of playerMeshes) {
        if (!visible.has(id)) {
          scene.remove(group);
          disposePlayerResources(group);
          playerMeshes.delete(id);
        }
      }
      for (const player of players) {
        let group = playerMeshes.get(player.id);
        if (!group) {
          group = createPlayer(player.color);
          playerMeshes.set(player.id, group);
          scene.add(group);
        }
        group.position.set(-5.8 + player.x * 11.6, 0, -2.8 + player.z * 5.6);
        group.visible = true;
        const material = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        material.color.set(player.color);
        const markerMaterial = (group.children[2] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        markerMaterial.color.set(player.color);
        material.transparent = !player.connected;
        material.opacity = player.connected ? 1 : 0.38;
      }
      renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const group of playerMeshes.values()) {
        scene.remove(group);
        disposePlayerResources(group);
      }
      playerMeshes.clear();

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach((material) => materials.add(material));
        }
      });
      sharedPlayerGeometries.forEach((geometry) => geometries.add(geometry));
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    },
  };
}
