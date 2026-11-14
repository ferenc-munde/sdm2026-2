import type { GameClientSnapshot, GamePlayer, MockGameStateAdapter } from "./game-state-adapter.mjs";
import { Player } from "./player/Player";
import type { CollisionMap } from "./physics/Collision";

const GRID_WIDTH = 20;
const GRID_HEIGHT = 10;

class PreviewCollisionMap implements CollisionMap {
  getTile(x: number, y: number): boolean {
    return x > 0 && x < GRID_WIDTH - 1 && y > 0 && y < GRID_HEIGHT - 1;
  }
  getWidth(): number { return GRID_WIDTH; }
  getHeight(): number { return GRID_HEIGHT; }
}

/** Drives one local PR #134 player and publishes its position to the mock UI state. */
export class PlayerPreviewController {
  private readonly player: Player;
  private disposed = false;

  constructor(private readonly playerId: string, private readonly adapter: MockGameStateAdapter) {
    const current = adapter.getSnapshot().players.find((candidate) => candidate.id === playerId);
    if (!current) throw new Error(`Player ${playerId} is missing from the gameplay snapshot.`);
    this.player = new Player(playerId, current.position.x * GRID_WIDTH, current.position.z * GRID_HEIGHT, new PreviewCollisionMap(), {
      speed: 5,
      maxInventorySlots: 8,
      interactionRange: 2,
    });
  }

  update(deltaTime: number): void {
    if (this.disposed) return;
    this.player.update(Math.min(Math.max(deltaTime, 0), 100));
    const { x, y } = this.player.getPosition();
    const snapshot: GameClientSnapshot = this.adapter.getSnapshot();
    const players = snapshot.players.map((candidate): GamePlayer => candidate.id === this.playerId
      ? {
          ...candidate,
          position: { x: clamp01(x / GRID_WIDTH), z: clamp01(y / GRID_HEIGHT) },
          direction: this.player.getDirection(),
          isMoving: this.player.getIsMoving(),
        }
      : candidate);
    this.adapter.publish({ ...snapshot, players });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.player.destroy();
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
