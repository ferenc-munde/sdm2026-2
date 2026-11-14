import type { GameInputSender } from "./game-state-adapter.mjs";
import { InputHandler, isTextEntryTarget } from "./input/InputHandler";

/**
 * Sends the local player's keyboard input to the room (issue #240). It never moves the player
 * itself: the server applies the movement and the new position comes back in the synced state.
 * A `move` input is sent only when the direction changes; E sends one `repair` per key press.
 */
export class RoomInputController {
  private readonly keys = new InputHandler();
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "e" && !event.repeat && !isTextEntryTarget(event.target)) {
      this.sender.sendInput({ type: "repair" });
    }
  };
  private readonly handleInactive = () => {
    this.keys.reset();
    this.sendMove(0, 0);
  };
  private sent = { x: 0, z: 0 };
  private disposed = false;

  constructor(private readonly sender: GameInputSender) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("blur", this.handleInactive);
    window.document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  /** Call once per frame. */
  update(): void {
    if (this.disposed) return;
    if (window.document.visibilityState === "hidden") {
      this.handleInactive();
      return;
    }
    // The key handler's y axis points down the screen, which is the train's z axis.
    const { x, y } = this.keys.getMovementVector();
    this.sendMove(x, y);
  }

  dispose(): void {
    if (this.disposed) return;
    this.sendMove(0, 0);
    this.disposed = true;
    this.keys.destroy();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("blur", this.handleInactive);
    window.document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private readonly handleVisibilityChange = () => {
    if (window.document.visibilityState === "hidden") this.handleInactive();
  };

  private sendMove(x: number, z: number): void {
    if (x === this.sent.x && z === this.sent.z) return;
    this.sent = { x, z };
    this.sender.sendInput({ type: "move", x, z });
  }
}
