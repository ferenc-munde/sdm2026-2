/**
 * Movement
 * Handles player movement logic with collision detection.
 */

import { CollisionDetector, CollisionMap } from '../physics/Collision';
import { InputHandler } from '../input/InputHandler';

export class Movement {
  private collisionDetector: CollisionDetector;
  private inputHandler: InputHandler;
  private velocity: { x: number; y: number } = { x: 0, y: 0 };
  private speed: number;

  constructor(inputHandler: InputHandler, collisionMap: CollisionMap, speed: number = 5) {
    this.inputHandler = inputHandler;
    this.collisionDetector = new CollisionDetector(collisionMap);
    this.speed = speed;
  }

  /**
   * Update movement based on input
   * Returns the delta movement { x, y }
   */
  update(deltaTime: number): { x: number; y: number } {
    const movementVector = this.inputHandler.getMovementVector();

    // Apply speed
    const deltaX = movementVector.x * this.speed * (deltaTime / 1000);
    const deltaY = movementVector.y * this.speed * (deltaTime / 1000);

    return { x: deltaX, y: deltaY };
  }

  /**
   * Apply movement with collision detection
   */
  applyMovement(currentX: number, currentY: number, deltaX: number, deltaY: number): { x: number; y: number } {
    return this.collisionDetector.moveWithCollision(currentX, currentY, deltaX, deltaY);
  }

  /**
   * Check if player is moving
   */
  isMoving(): boolean {
    return this.inputHandler.isMoving();
  }

  /**
   * Get current input
   */
  getInputVector(): { x: number; y: number } {
    return this.inputHandler.getMovementVector();
  }

  /**
   * Get collision detector
   */
  getCollisionDetector(): CollisionDetector {
    return this.collisionDetector;
  }

  /**
   * Set player speed
   */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * Get player speed
   */
  getSpeed(): number {
    return this.speed;
  }
}
