import * as THREE from "three";
import { RAILWAY_LAYOUT, wrapX } from "../RailwayEnvironment";

interface InstanceTransform {
  baseX: number;
  y: number;
  z: number;
  speedFactor: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  yaw?: number;
}

interface MovingNode {
  object: THREE.Object3D;
  baseX: number;
  baseY: number;
  baseZ: number;
  speedFactor: number;
}

const motionTransform = new THREE.Object3D();

/** Advance only visual scenery. The multiplayer snapshot and player coordinates are never touched. */
export function advanceTrainMotion(railway: THREE.Group, train: THREE.Group, deltaSeconds: number): void {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const data = railway.userData;
  const loopLength = Number(data.loopLength) || RAILWAY_LAYOUT.loopLength;
  const speed = Number(data.travelSpeed) || RAILWAY_LAYOUT.travelSpeed;
  const distance = (Number(data.travelDistance) || 0) + speed * dt;
  const elapsed = (Number(data.elapsedSeconds) || 0) + dt;
  data.travelDistance = distance;
  data.elapsedSeconds = elapsed;

  const batches = data.motionBatches as THREE.InstancedMesh[] | undefined;
  for (const batch of batches ?? []) {
    const transforms = batch.userData.motionInstances as InstanceTransform[] | undefined;
    if (!transforms) continue;
    transforms.forEach((transform, index) => {
      motionTransform.position.set(
        wrapX(transform.baseX - distance * transform.speedFactor, loopLength),
        transform.y,
        transform.z,
      );
      motionTransform.rotation.set(0, transform.yaw ?? 0, 0);
      motionTransform.scale.set(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1);
      motionTransform.updateMatrix();
      batch.setMatrixAt(index, motionTransform.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
  }

  const nodes = data.motionNodes as MovingNode[] | undefined;
  for (const node of nodes ?? []) {
    node.object.position.set(
      wrapX(node.baseX - distance * node.speedFactor, loopLength),
      node.baseY,
      node.baseZ,
    );
  }

  // The train and its crew share this visual-only root; the authoritative positions stay unchanged.
  train.position.set(Math.sin(elapsed * 9) * 0.012, Math.sin(elapsed * 15) * 0.014, 0);
  train.rotation.z = Math.sin(elapsed * 7) * 0.0012;
}
