/**
 * Interaction
 * Reusable interaction system for E key interactions.
 * Uses an event-based approach for flexibility.
 */

export interface InteractionTarget {
  id: string;
  x: number;
  y: number;
  type: string;
  onInteract?: (player: any) => void;
}

export type InteractionCallback = (target: InteractionTarget, player: any) => void;

export class InteractionSystem {
  private readonly handleKeyDown = (event: KeyboardEvent) => this.onKeyDown(event);
  private targets: Map<string, InteractionTarget> = new Map();
  private callbacks: Map<string, InteractionCallback[]> = new Map();
  private interactionRange: number;

  constructor(interactionRange: number = 2) {
    this.interactionRange = interactionRange;

    // Listen for E key
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'e') {
      this.attemptInteraction();
    }
  }

  /**
   * Register an interaction target
   */
  registerTarget(target: InteractionTarget): void {
    this.targets.set(target.id, target);
  }

  /**
   * Unregister an interaction target
   */
  unregisterTarget(targetId: string): void {
    this.targets.delete(targetId);
  }

  /**
   * Register a callback for a specific interaction type
   */
  on(type: string, callback: InteractionCallback): void {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, []);
    }
    this.callbacks.get(type)!.push(callback);
  }

  /**
   * Unregister a callback
   */
  off(type: string, callback: InteractionCallback): void {
    const callbacks = this.callbacks.get(type);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Find closest interactable target within range of player
   */
  findClosestTarget(playerX: number, playerY: number): InteractionTarget | null {
    let closest: InteractionTarget | null = null;
    let closestDistance = this.interactionRange;

    this.targets.forEach((target) => {
      const distance = Math.hypot(target.x - playerX, target.y - playerY);
      if (distance < closestDistance) {
        closest = target;
        closestDistance = distance;
      }
    });

    return closest;
  }

  /**
   * Attempt interaction at player's location
   */
  attemptInteraction(playerX?: number, playerY?: number): boolean {
    // This will be called with player position from Player class
    if (playerX === undefined || playerY === undefined) {
      return false;
    }

    const target = this.findClosestTarget(playerX, playerY);
    if (!target) return false;

    // Call registered callbacks
    const callbacks = this.callbacks.get(target.type);
    if (callbacks) {
      callbacks.forEach((callback) => {
        callback(target, { x: playerX, y: playerY });
      });
    }

    // Call inline callback if present
    if (target.onInteract) {
      target.onInteract({ x: playerX, y: playerY });
    }

    return true;
  }

  /**
   * Get all targets within range of player
   */
  getTargetsInRange(playerX: number, playerY: number): InteractionTarget[] {
    const result: InteractionTarget[] = [];

    this.targets.forEach((target) => {
      const distance = Math.hypot(target.x - playerX, target.y - playerY);
      if (distance <= this.interactionRange) {
        result.push(target);
      }
    });

    return result;
  }

  /**
   * Set interaction range
   */
  setInteractionRange(range: number): void {
    this.interactionRange = range;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.targets.clear();
    this.callbacks.clear();
  }
}
