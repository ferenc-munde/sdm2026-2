/**
 * Animator
 * Manages sprite animation for four-direction movement.
 */

export interface AnimationFrame {
  frameIndex: number;
  duration: number;
}

export interface DirectionalAnimation {
  up: AnimationFrame[];
  down: AnimationFrame[];
  left: AnimationFrame[];
  right: AnimationFrame[];
}

export class Animator {
  private currentDirection: 'up' | 'down' | 'left' | 'right' = 'down';
  private currentFrameIndex: number = 0;
  private elapsedTime: number = 0;
  private isMoving: boolean = false;
  private animations: Map<string, DirectionalAnimation> = new Map();
  private currentAnimationName: string = 'walk';

  constructor() {
    // Initialize with default walk animation
    this.setupDefaultAnimation();
  }

  private setupDefaultAnimation(): void {
    const defaultAnimation: DirectionalAnimation = {
      up: [{ frameIndex: 0, duration: 100 }],
      down: [{ frameIndex: 0, duration: 100 }],
      left: [{ frameIndex: 0, duration: 100 }],
      right: [{ frameIndex: 0, duration: 100 }],
    };
    this.animations.set('idle', defaultAnimation);
    this.animations.set('walk', defaultAnimation);
  }

  /**
   * Register a new animation
   */
  registerAnimation(name: string, animation: DirectionalAnimation): void {
    this.animations.set(name, animation);
  }

  /**
   * Update animation state
   */
  update(deltaTime: number): void {
    this.elapsedTime += deltaTime;

    const animation = this.animations.get(this.currentAnimationName);
    if (!animation) return;

    const directionFrames = animation[this.currentDirection];
    if (directionFrames.length === 0) return;

    const currentFrame = directionFrames[this.currentFrameIndex];

    if (this.elapsedTime >= currentFrame.duration) {
      this.elapsedTime = 0;
      this.currentFrameIndex = (this.currentFrameIndex + 1) % directionFrames.length;
    }
  }

  /**
   * Set the current direction
   */
  setDirection(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (direction !== this.currentDirection) {
      this.currentDirection = direction;
      this.currentFrameIndex = 0;
      this.elapsedTime = 0;
    }
  }

  /**
   * Set whether player is moving
   */
  setMoving(isMoving: boolean): void {
    if (this.isMoving !== isMoving) {
      this.isMoving = isMoving;
      this.currentAnimationName = isMoving ? 'walk' : 'idle';
      this.currentFrameIndex = 0;
      this.elapsedTime = 0;
    }
  }

  /**
   * Get current animation frame index
   */
  getCurrentFrameIndex(): number {
    const animation = this.animations.get(this.currentAnimationName);
    if (!animation) return 0;

    const directionFrames = animation[this.currentDirection];
    if (directionFrames.length === 0) return 0;

    return directionFrames[this.currentFrameIndex].frameIndex;
  }

  /**
   * Get current direction
   */
  getDirection(): 'up' | 'down' | 'left' | 'right' {
    return this.currentDirection;
  }

  /**
   * Check if currently animating
   */
  isAnimating(): boolean {
    return this.isMoving;
  }
}
