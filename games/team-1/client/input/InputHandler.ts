/**
 * InputHandler
 * Captures keyboard input and normalizes movement vectors.
 * Supports both WASD and arrow keys.
 */

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export class InputHandler {
  private input: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  private onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    switch (key) {
      case 'w':
      case 'arrowup':
        this.input.forward = true;
        break;
      case 's':
      case 'arrowdown':
        this.input.backward = true;
        break;
      case 'a':
      case 'arrowleft':
        this.input.left = true;
        break;
      case 'd':
      case 'arrowright':
        this.input.right = true;
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    switch (key) {
      case 'w':
      case 'arrowup':
        this.input.forward = false;
        break;
      case 's':
      case 'arrowdown':
        this.input.backward = false;
        break;
      case 'a':
      case 'arrowleft':
        this.input.left = false;
        break;
      case 'd':
      case 'arrowright':
        this.input.right = false;
        break;
    }
  }

  /**
   * Get current input state
   */
  getInput(): InputState {
    return { ...this.input };
  }

  /**
   * Calculate normalized movement vector from input
   * Returns { x, y } with magnitude <= 1
   */
  getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.input.forward) y -= 1;
    if (this.input.backward) y += 1;
    if (this.input.left) x -= 1;
    if (this.input.right) x += 1;

    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const length = Math.sqrt(x * x + y * y);
      x /= length;
      y /= length;
    }

    return { x, y };
  }

  /**
   * Determine the primary direction based on movement
   */
  getDirection(): 'up' | 'down' | 'left' | 'right' | null {
    const { x, y } = this.getMovementVector();

    if (x === 0 && y === 0) return null;

    // Determine primary direction (vertical or horizontal precedence)
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    if (absY > absX) {
      return y < 0 ? 'up' : 'down';
    } else {
      return x < 0 ? 'left' : 'right';
    }
  }

  /**
   * Check if player is currently moving
   */
  isMoving(): boolean {
    const { x, y } = this.getMovementVector();
    return x !== 0 || y !== 0;
  }

  /**
   * Cleanup: remove event listeners
   */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
  }
}
