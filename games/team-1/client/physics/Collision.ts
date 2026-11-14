/**
 * Collision
 * Simple AABB collision detection against a static collision map.
 */

export interface CollisionMap {
  getTile(x: number, y: number): boolean; // true = walkable, false = blocked
  getWidth(): number;
  getHeight(): number;
  move?(x: number, y: number, dx: number, dy: number): { x: number; y: number };
}

export class CollisionDetector {
  private collisionMap: CollisionMap;
  private playerRadius: number;

  constructor(collisionMap: CollisionMap, playerRadius: number = 0.4) {
    this.collisionMap = collisionMap;
    this.playerRadius = playerRadius;
  }

  /**
   * Check if a position is walkable
   */
  isWalkable(x: number, y: number): boolean {
    // Check bounds
    if (x - this.playerRadius < 0 || x + this.playerRadius > this.collisionMap.getWidth()) {
      return false;
    }
    if (y - this.playerRadius < 0 || y + this.playerRadius > this.collisionMap.getHeight()) {
      return false;
    }

    // Check collision at four corners of player radius
    const corners = [
      { x: x - this.playerRadius, y: y - this.playerRadius },
      { x: x + this.playerRadius, y: y - this.playerRadius },
      { x: x - this.playerRadius, y: y + this.playerRadius },
      { x: x + this.playerRadius, y: y + this.playerRadius },
    ];

    return corners.every((corner) => this.collisionMap.getTile(Math.floor(corner.x), Math.floor(corner.y)));
  }

  /**
   * Move a player, handling collisions
   * Returns the actual position after collision resolution
   */
  moveWithCollision(currentX: number, currentY: number, deltaX: number, deltaY: number): { x: number; y: number } {
    if (this.collisionMap.move) return this.collisionMap.move(currentX, currentY, deltaX, deltaY);
    // Try full movement first
    const newX = currentX + deltaX;
    const newY = currentY + deltaY;

    if (this.isWalkable(newX, newY)) {
      return { x: newX, y: newY };
    }

    // Try axis-separated movement (slide along walls)
    if (this.isWalkable(newX, currentY)) {
      return { x: newX, y: currentY };
    }

    if (this.isWalkable(currentX, newY)) {
      return { x: currentX, y: newY };
    }

    // Can't move, stay in place
    return { x: currentX, y: currentY };
  }

  /**
   * Update collision map (in case it changes dynamically)
   */
  setCollisionMap(collisionMap: CollisionMap): void {
    this.collisionMap = collisionMap;
  }
}
