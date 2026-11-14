/**
 * Player
 * Main player class combining all mechanics:
 * - Position and state
 * - Movement and collision
 * - Animation
 * - Inventory
 * - Interactions
 */

import { InputHandler, isTextEntryTarget } from '../input/InputHandler';
import { Movement } from './Movement';
import { Animator } from './Animator';
import { Inventory, InventoryItem } from './Inventory';
import { InteractionSystem } from './Interaction';
import { CollisionMap } from '../physics/Collision';
import type { PlayerState } from '../../shared/types/game';

export class Player {
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'e' && !event.repeat && !isTextEntryTarget(event.target)) this.interact();
  };
  private id: string;
  private x: number;
  private y: number;
  private direction: 'up' | 'down' | 'left' | 'right' = 'down';
  private isMoving: boolean = false;

  private inputHandler: InputHandler;
  private movement: Movement;
  private animator: Animator;
  private inventory: Inventory;
  private interactionSystem: InteractionSystem;

  constructor(
    id: string,
    initialX: number,
    initialY: number,
    collisionMap: CollisionMap,
    config: { speed: number; maxInventorySlots: number; interactionRange: number }
  ) {
    this.id = id;
    this.x = initialX;
    this.y = initialY;

    // Initialize subsystems
    this.inputHandler = new InputHandler();
    this.movement = new Movement(this.inputHandler, collisionMap, config.speed);
    this.animator = new Animator();
    this.inventory = new Inventory(config.maxInventorySlots);
    this.interactionSystem = new InteractionSystem(config.interactionRange);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Update player state
   * Should be called once per frame with deltaTime in milliseconds
   */
  update(deltaTime: number): void {
    // Update movement
    const delta = this.movement.update(deltaTime);
    const newPos = this.movement.applyMovement(this.x, this.y, delta.x, delta.y);
    this.isMoving = newPos.x !== this.x || newPos.y !== this.y;
    this.x = newPos.x;
    this.y = newPos.y;

    // Update direction
    const newDirection = this.inputHandler.getDirection();
    if (newDirection) {
      this.direction = newDirection;
    }

    // Update animator
    this.animator.setDirection(this.direction);
    this.animator.setMoving(this.isMoving);
    this.animator.update(deltaTime);
  }

  /**
   * Handle interaction attempt
   */
  interact(): boolean {
    return this.interactionSystem.attemptInteraction(this.x, this.y);
  }

  /**
   * Get player state for network synchronization
   */
  getState(): PlayerState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      direction: this.direction,
      isMoving: this.isMoving,
      inventory: this.inventory.getItems(),
    };
  }

  /**
   * Set player state from network
   */
  setState(state: Partial<PlayerState>): void {
    if (state.x !== undefined) this.x = state.x;
    if (state.y !== undefined) this.y = state.y;
    if (state.direction !== undefined) {
      this.direction = state.direction;
      this.animator.setDirection(state.direction);
    }
    if (state.isMoving !== undefined) {
      this.isMoving = state.isMoving;
      this.animator.setMoving(state.isMoving);
    }
  }

  /**
   * Inventory management
   */
  addItem(item: InventoryItem): boolean {
    return this.inventory.addItem(item);
  }

  removeItem(itemId: string, quantity?: number): boolean {
    return this.inventory.removeItem(itemId, quantity);
  }

  hasItem(itemId: string, quantity?: number): boolean {
    return this.inventory.hasItem(itemId, quantity);
  }

  getInventory() {
    return this.inventory;
  }

  /**
   * Interaction system access
   */
  getInteractionSystem() {
    return this.interactionSystem;
  }

  /**
   * Getters for state
   */
  getId(): string {
    return this.id;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  getDirection(): 'up' | 'down' | 'left' | 'right' {
    return this.direction;
  }

  getIsMoving(): boolean {
    return this.isMoving;
  }

  getAnimator(): Animator {
    return this.animator;
  }

  /**
   * Teleport player (for respawning, etc)
   */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.inputHandler.destroy();
    this.interactionSystem.destroy();
  }
}
