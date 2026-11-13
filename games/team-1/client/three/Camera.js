import * as THREE from "three";

const VIEW_HEIGHT = 28;

export function createCamera(aspectRatio = 16 / 9) {
  const halfHeight = VIEW_HEIGHT / 2;
  const halfWidth = halfHeight * aspectRatio;

  const camera = new THREE.OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    0.1,
    100
  );

  camera.position.set(0, 32, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  return camera;
}

export function resizeCamera(camera, aspectRatio) {
  const halfHeight = VIEW_HEIGHT / 2;
  const halfWidth = halfHeight * aspectRatio;

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;

  camera.updateProjectionMatrix();
}