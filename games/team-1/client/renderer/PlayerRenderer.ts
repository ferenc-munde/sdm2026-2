/**
 * PlayerRenderer
 * Renders player in Three.js
 */

import * as THREE from 'three';
import { Player } from '../player/Player';
import { Animator } from '../player/Animator';

export class PlayerRenderer {
  private player: Player;
  private mesh: THREE.Mesh;
  private spriteMap: Map<string, HTMLCanvasElement> = new Map();

  constructor(player: Player, scene: THREE.Scene, spriteWidth: number = 32, spriteHeight: number = 32) {
    this.player = player;

    // Create a simple colored quad for now (will be replaced with sprite later)
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(player.getPosition().x, -player.getPosition().y, 0);

    scene.add(this.mesh);
  }

  /**
   * Update renderer based on player state
   */
  update(): void {
    const pos = this.player.getPosition();
    this.mesh.position.x = pos.x;
    this.mesh.position.y = -pos.y; // Flip Y for screen coordinates

    // TODO: Update sprite/texture based on animator frame index and direction
  }

  /**
   * Set sprite texture
   */
  setSprite(texture: THREE.Texture): void {
    if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
      this.mesh.material.map = texture;
    }
  }

  /**
   * Get Three.js mesh
   */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
