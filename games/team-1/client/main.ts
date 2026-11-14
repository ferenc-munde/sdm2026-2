import * as THREE from "three";
import { Player } from "./player/Player";
import { PlayerRenderer } from "./renderer/PlayerRenderer";

// Placeholder collision map
class SimpleCollisionMap {
  private width: number;
  private height: number;
  private walkable: boolean[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));

    // Create some walls for testing
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Create a border of walls
        if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
          this.walkable[y][x] = false;
        }
      }
    }
  }

  getTile(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.walkable[y][x];
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }
}

// Initialize Three.js scene
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222);

const camera = new THREE.OrthographicCamera(
  -window.innerWidth / 100,
  window.innerWidth / 100,
  window.innerHeight / 100,
  -window.innerHeight / 100,
  0.1,
  1000
);
camera.position.z = 10;

const scene = new THREE.Scene();

// Create collision map
const collisionMap = new SimpleCollisionMap(20, 20);

// Create player
const player = new Player('player-1', 10, 10, collisionMap, {
  speed: 5,
  maxInventorySlots: 8,
  interactionRange: 2,
});
camera.position.x = player.getPosition().x;
camera.position.y = -player.getPosition().y;

// Create player renderer
const playerRenderer = new PlayerRenderer(player, scene);

// Game loop
let lastTime = Date.now();
function gameLoop() {
  requestAnimationFrame(gameLoop);

  const now = Date.now();
  const deltaTime = now - lastTime;
  lastTime = now;

  // Update player
  player.update(deltaTime);

  // Update renderer
  playerRenderer.update();

  // Render scene
  renderer.render(scene, camera);
}

gameLoop();

// Handle window resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.left = -window.innerWidth / 100;
  camera.right = window.innerWidth / 100;
  camera.top = window.innerHeight / 100;
  camera.bottom = -window.innerHeight / 100;
  camera.updateProjectionMatrix();
});
