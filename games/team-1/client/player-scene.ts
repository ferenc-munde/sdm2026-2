import * as THREE from "three";
import type { GameClientSnapshot } from "./game-state-adapter.mjs";
import { toPlayerViewModels } from "./presentation-model.mjs";
import { TRAIN_LAYOUT } from "./environment/TrainEnvironment";
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
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 24, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  const playerGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 12);
  const headGeometry = new THREE.SphereGeometry(0.25, 14, 10);
  const sharedPlayerGeometries = new Set<THREE.BufferGeometry>([playerGeometry, headGeometry]);
  const playerMeshes = new Map<string, THREE.Group>();

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
    const aspect = width / height;
    const layoutPadding = 1.5;
    const viewHeight = Math.max(
      TRAIN_LAYOUT.width + layoutPadding * 2,
      (TRAIN_LAYOUT.length + layoutPadding * 2) / aspect,
    );
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
        group.position.set(
          -TRAIN_LAYOUT.length / 2 + PLAYER_INSET.length + player.x * (TRAIN_LAYOUT.length - PLAYER_INSET.length * 2),
          0,
          -TRAIN_LAYOUT.width / 2 + PLAYER_INSET.width + player.z * (TRAIN_LAYOUT.width - PLAYER_INSET.width * 2),
        );
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
