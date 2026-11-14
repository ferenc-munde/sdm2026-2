import * as THREE from "three";
import type { GameClientSnapshot } from "./game-state-adapter.mjs";
import { toPlayerViewModels } from "./presentation-model.mjs";
import { TRAIN_LAYOUT } from "./environment/TrainEnvironment";
import { advanceTrainMotion } from "./environment/effects/TrainMotionEffects";
import { createScene } from "./scene";

export type TrainScene = {
  update(snapshot: GameClientSnapshot): void;
  dispose(): void;
};

export type SceneRendererFactory = (
  canvas: HTMLCanvasElement,
) => Pick<THREE.WebGLRenderer, "setPixelRatio" | "setSize" | "render" | "dispose">;

/** How far the players stay from the walls of the train, in world units. */
export const PLAYER_INSET = { length: 1.5, width: 1.25 } as const;

/** Framing that leaves room for both exterior tracks while keeping the full train prominent. */
export function trainCameraViewHeight(aspectRatio: number): number {
  const safeAspect = Math.max(0.25, aspectRatio);
  const viewWidth = TRAIN_LAYOUT.length + 10;
  return Math.max(TRAIN_LAYOUT.width + 9.2, viewWidth / safeAspect);
}

function createWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function mountTrainScene(
  canvas: HTMLCanvasElement,
  fallback: HTMLElement,
  createRenderer: SceneRendererFactory = createWebGLRenderer,
): TrainScene {
  let renderer: ReturnType<SceneRendererFactory>;
  try {
    renderer = createRenderer(canvas);
  } catch {
    fallback.hidden = false;
    canvas.hidden = true;
    return { update: () => undefined, dispose: () => undefined };
  }

  const scene = createScene();
  const railway = scene.userData.railwayMotion as THREE.Group;
  const trainRoot = scene.userData.trainMotionRoot as THREE.Group;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
  camera.position.set(0, 31, 9);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  const playerGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 12);
  const headGeometry = new THREE.SphereGeometry(0.25, 14, 10);
  const facingGeometry = new THREE.SphereGeometry(0.11, 10, 8);
  const sharedPlayerGeometries = new Set<THREE.BufferGeometry>([playerGeometry, headGeometry, facingGeometry]);
  const playerMeshes = new Map<string, THREE.Group>();
  const movingPlayers = new Set<string>();

  function createPlayer(color: string): THREE.Group {
    const group = new THREE.Group();
    group.name = "player";
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
    marker.position.y = 0.04;
    const facing = new THREE.Mesh(facingGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    facing.position.set(0, 1.38, 0.2);
    group.add(body, head, marker, facing);
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
    const aspect = width / height;
    const viewHeight = trainCameraViewHeight(aspect);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let frame = 0;
  let lastFrameAt = performance.now();
  const draw = (now: number) => {
    const elapsedSeconds = Math.max(0, now - lastFrameAt) / 1000;
    lastFrameAt = now;
    const smoothing = 1 - Math.exp(-14 * elapsedSeconds);
    advanceTrainMotion(railway, trainRoot, elapsedSeconds);
    for (const [id, group] of playerMeshes) {
      const target = group.userData.targetPosition as THREE.Vector3 | undefined;
      if (target) group.position.lerp(target, smoothing);
      const bounce = movingPlayers.has(id) ? Math.abs(Math.sin(now / 120)) * 0.12 : 0;
      group.children[0].position.y = 0.54 + bounce;
      group.children[1].position.y = 1.15 + bounce;
      group.children[3].position.y = 1.38 + bounce;
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return {
    update(snapshot) {
      const players = toPlayerViewModels(snapshot);
      const visible = new Set(players.map((player) => player.id));
      for (const [id, group] of playerMeshes) {
        if (!visible.has(id)) {
          trainRoot.remove(group);
          disposePlayerResources(group);
          playerMeshes.delete(id);
          movingPlayers.delete(id);
        }
      }
      for (const player of players) {
        let group = playerMeshes.get(player.id);
        if (!group) {
          group = createPlayer(player.color);
          playerMeshes.set(player.id, group);
          trainRoot.add(group);
        }
        const targetX = -TRAIN_LAYOUT.length / 2 + PLAYER_INSET.length + player.x * (TRAIN_LAYOUT.length - PLAYER_INSET.length * 2);
        const targetZ = -TRAIN_LAYOUT.width / 2 + PLAYER_INSET.width + player.z * (TRAIN_LAYOUT.width - PLAYER_INSET.width * 2);
        const targetPosition = group.userData.targetPosition as THREE.Vector3 | undefined;
        if (targetPosition) targetPosition.set(targetX, 0, targetZ);
        else {
          group.position.set(targetX, 0, targetZ);
          group.userData.targetPosition = new THREE.Vector3(targetX, 0, targetZ);
        }
        group.visible = true;
        if (player.isMoving) movingPlayers.add(player.id);
        else movingPlayers.delete(player.id);
        const facing = group.children[3];
        facing.position.x = player.direction === "left" ? -0.2 : player.direction === "right" ? 0.2 : 0;
        facing.position.z = player.direction === "up" ? -0.2 : player.direction === "left" || player.direction === "right" ? 0 : 0.2;
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
        trainRoot.remove(group);
        disposePlayerResources(group);
      }
      playerMeshes.clear();
      movingPlayers.clear();

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
