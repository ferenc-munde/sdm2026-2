import type { GameClientSnapshot, GamePlayer, MockGameStateAdapter, PreviewItem } from "./game-state-adapter.mjs";
import { Player } from "./player/Player";
import type { CollisionMap } from "./physics/Collision";
import { isTextEntryTarget } from "./input/InputHandler";
import { isTrainWalkable, moveInTrain } from "../shared/train-collision";
import { SECTIONS, TASK_CATALOGUE, TRAIN_SIZE, WALKABLE, sectionAt } from "../shared/train-layout";

class PreviewCollisionMap implements CollisionMap {
  getTile(x: number, y: number): boolean {
    return isTrainWalkable(x, y);
  }
  getWidth(): number { return WALKABLE.length; }
  getHeight(): number { return WALKABLE.width; }
  move(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
    const position = moveInTrain(x, y, dx, dy);
    return { x: position.x, y: position.z };
  }
}

const ITEMS: PreviewItem[] = [
  { id: "wrench", name: "Wrench", x: 0.18, z: 0.62 },
  { id: "wire", name: "Wire", x: 0.4, z: 0.35 },
  { id: "fuse", name: "Fuse", x: 0.7, z: 0.65 },
];

/** Drives the local preview without changing authoritative room rules. */
export class PlayerPreviewController {
  private readonly player: Player;
  private disposed = false;
  private items = ITEMS.map((item) => ({ ...item }));
  private signal = "";
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || isTextEntryTarget(event.target)) return;
    const signals: Record<string, string> = { "1": "Ready", "2": "Help!", "3": "On my way" };
    if (signals[event.key]) this.signal = this.signal === signals[event.key] ? "" : signals[event.key];
  };

  constructor(private readonly playerId: string, private readonly adapter: MockGameStateAdapter) {
    const current = adapter.getSnapshot().players.find((candidate) => candidate.id === playerId);
    if (!current) throw new Error(`Player ${playerId} is missing from the gameplay snapshot.`);
    this.player = new Player(playerId, current.position.x * WALKABLE.length, current.position.z * WALKABLE.width, new PreviewCollisionMap(), {
      speed: 5,
      maxInventorySlots: 8,
      interactionRange: 1.5,
    });
    const interactions = this.player.getInteractionSystem();
    for (const item of this.items) {
      interactions.registerTarget({
        id: item.id, x: item.x * WALKABLE.length, y: item.z * WALKABLE.width, type: "item",
        onInteract: () => {
          if (!this.player.addItem({ id: item.id, name: item.name, type: "item", quantity: 1 })) return;
          this.items = this.items.filter((candidate) => candidate.id !== item.id);
          interactions.unregisterTarget(item.id);
        },
      });
    }
    TASK_CATALOGUE.forEach((task) => {
      const index = SECTIONS.indexOf(task.section);
      const x = (-TRAIN_SIZE.length / 2 + (index + 0.5) * TRAIN_SIZE.length / SECTIONS.length) + WALKABLE.length / 2;
      const z = (task.id === "instruments" || task.id === "brakes" ? -1.45 : task.id === "wiring" ? 1.15 : 1.05) + WALKABLE.width / 2;
      interactions.registerTarget({
        id: task.id, x, y: z, type: "station",
        onInteract: () => {
          const snapshot = this.adapter.getSnapshot();
          const tasks = snapshot.tasks.map((entry) => {
            if (entry.id !== task.id || entry.progress >= 100) return entry;
            const progress = Math.min(100, entry.progress + 25);
            return { ...entry, progress, status: progress === 100 ? "complete" as const : "in-progress" as const };
          });
          this.adapter.publish({ ...snapshot, tasks, repairs: { ...snapshot.repairs, completed: tasks.filter((entry) => entry.progress >= 100).length } });
        },
      });
    });
    window.addEventListener("keydown", this.handleKeyDown);
  }

  update(deltaTime: number): void {
    if (this.disposed) return;
    this.player.update(Math.min(Math.max(deltaTime, 0), 100));
    const { x, y } = this.player.getPosition();
    const snapshot: GameClientSnapshot = this.adapter.getSnapshot();
    const players = snapshot.players.map((candidate): GamePlayer => candidate.id === this.playerId
      ? {
          ...candidate,
          position: { x: clamp01(x / WALKABLE.length), z: clamp01(y / WALKABLE.width) },
          direction: this.player.getDirection(),
          isMoving: this.player.getIsMoving(),
          section: sectionAt(x / WALKABLE.length),
          signal: this.signal,
        }
      : candidate);
    const target = this.player.getInteractionSystem().findClosestTarget(x, y);
    const item = this.items.find((candidate) => candidate.id === target?.id);
    const task = snapshot.tasks.find((candidate) => candidate.id === target?.id);
    const inventory = this.player.getInventory().getItems().map((entry) => ({
      id: entry.id, name: entry.name, x: 0, z: 0,
    }));
    this.adapter.publish({
      ...snapshot, players, localPlayerId: this.playerId,
      previewMechanics: { inventory, items: this.items, prompt: item ? `E · Collect ${item.name}` : task ? `E · ${task.label}` : "" },
    });
  }

  removeItem(id: string): void {
    this.player.removeItem(id);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    this.player.destroy();
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
