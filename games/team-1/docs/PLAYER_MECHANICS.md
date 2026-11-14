# Player mechanics

> **Author:** Ahmed Iftikhar (`ahmedif12`), Developer 1, player mechanics. Written for pull request #134 and moved here in issue #265, brought in line with the code on `Team_1_Feature` as of 2026-11-14. The player classes themselves reached the branch through #185.

This describes the player classes in `client/`: what each one does, how to use it, and where it runs today. For how the game talks to the server, read [PLATFORM.md](PLATFORM.md) first.

## Where the player classes run today

The game has two modes (see [README.md](README.md)), and the player classes play a different part in each.

| Mode | Who moves the player | What uses the classes here |
|---|---|---|
| **Live** (default): the game is a room on the platform | The **server**. `shared/game.ts` applies movement every tick from `move` inputs, at `playerSpeed` from `config/game.json`. | `InputHandler` and `client/room-input-controller.ts` send movement, repair and signal inputs. They never move the player locally. |
| **Mock** (`?mock` in the address): everything in the page | The **client**. `client/player-preview-controller.ts` creates one `Player`, updates it every frame and publishes its position into the mock snapshot. | The whole `Player` with `Movement`, `Collision`, `Animator`, `Inventory` and `InteractionSystem`. |

In live play positions and signals come from synced room state. Both modes use `shared/train-collision.ts` for train boundaries, partitions and major equipment. Inventory and item pickups are local to the mock preview; live repairs remain section-based server rules.

Controls: WASD or arrows move, E interacts, and 1/2/3 toggle Ready/Help!/On my way above the player. In mock mode, approach the gold items and press E to collect them; use the inventory's Remove button to discard one. Repair stations can also be interacted with in the mock, with local-only progress.

The live room adapter derives facing from the synchronized movement vector and walking from changes in the authoritative position. It keeps the last observed facing while idle, including when movement is blocked. Facing is tracked locally: a player already idle when a client joins initially faces down until that client observes a direction.

## Files

```
client/
├── player/
│   ├── Player.ts        the coordinator: owns the parts below
│   ├── Movement.ts      velocity-based movement with collision
│   ├── Animator.ts      four-direction animation state
│   ├── Inventory.ts     item storage with stacks
│   └── Interaction.ts   E-key interaction targets and events
├── input/
│   └── InputHandler.ts  keyboard capture and a normalized movement vector
├── physics/
│   └── Collision.ts     collision against a walkability map
├── player-preview-controller.ts   mock mode: drives one Player
└── room-input-controller.ts       live mode: sends inputs to the room
```

Two files from the original pull request were not kept. `client/renderer/PlayerRenderer.ts` drew the player as a flat coloured quad; players are drawn by `client/player-scene.ts` (body, head and floor marker in the player's colour). `shared/schemas/index.ts` held a first state schema; the synced state is `TrainState` in `shared/game.ts`.

## The classes

### `Player`

The coordinator that brings the parts together.

```ts
import { Player } from "./player/Player";

const player = new Player("player-1", startX, startY, collisionMap, {
  speed: 5,
  maxInventorySlots: 8,
  interactionRange: 2,
});

player.update(deltaTime); // once per frame, deltaTime in milliseconds

const state = player.getState(); // { id, x, y, direction, isMoving, inventory }

player.addItem({ id: "wrench", name: "Wrench", type: "tool", quantity: 1 });
player.hasItem("wrench");
player.interact();
```

- `update(deltaTime)`: runs movement and animation.
- `getState()` / `setState()`: read or overwrite the player's state.
- `addItem()`, `removeItem()`, `hasItem()`, `getInventory()`: inventory.
- `interact()`, `getInteractionSystem()`: interactions.
- `getPosition()` / `setPosition()`, `getDirection()`, `getIsMoving()`, `getAnimator()`.
- `destroy()`: removes the key listeners. Always call it when the player goes away.

### `InputHandler`

Captures WASD and the arrow keys on `window` and gives a movement vector whose length is at most 1, so walking diagonally is not faster.

```ts
import { InputHandler } from "./input/InputHandler";

const input = new InputHandler();
const { x, y } = input.getMovementVector(); // y points down the screen
const direction = input.getDirection();     // "up" | "down" | "left" | "right" | null
if (input.isMoving()) { /* ... */ }
input.destroy();
```

This is the one class both modes use. In live mode its `y` axis is sent as the train's `z` axis.

### `Movement`

Turns the input vector into a per-frame step and applies it with collision.

```ts
import { Movement } from "./player/Movement";

const movement = new Movement(inputHandler, collisionMap, speed);
const delta = movement.update(deltaTime);
const next = movement.applyMovement(currentX, currentY, delta.x, delta.y);
```

Also: `isMoving()`, `getInputVector()`, `getCollisionDetector()`, `setSpeed()`, `getSpeed()`.

### `Animator`

Keeps the animation state for four directions: which animation plays (idle or walk) and which frame it is on.

```ts
import { Animator } from "./player/Animator";

const animator = new Animator();
animator.setDirection("down");
animator.setMoving(true);
animator.update(deltaTime);
const frameIndex = animator.getCurrentFrameIndex();
```

Custom animations:

```ts
animator.registerAnimation("walk", {
  up:    [{ frameIndex: 0, duration: 100 }, { frameIndex: 1, duration: 100 }],
  down:  [/* ... */],
  left:  [/* ... */],
  right: [/* ... */],
});
```

Nothing draws these frames yet: there are no sprites, and the scene shows simple 3D shapes.

### `Inventory`

Item storage with a slot limit and stacks.

```ts
import { Inventory, type InventoryItem } from "./player/Inventory";

const inventory = new Inventory(8);
const item: InventoryItem = { id: "wrench", name: "Wrench", type: "tool", quantity: 1, maxStack: 1 };

inventory.addItem(item);
inventory.removeItem("wrench", 1);
inventory.hasItem("wrench");
inventory.getItems();
inventory.getSlotsUsed();
inventory.isFull();
```

Also: `getItem()`, `getMaxSlots()`, `clear()`, `serialize()`.

### `InteractionSystem`

Targets in the world that a player can use with **E** when close enough, and events for the code that reacts.

```ts
import { InteractionSystem } from "./player/Interaction";

const interactions = new InteractionSystem(interactionRange);

interactions.registerTarget({ id: "repair-panel-1", x: 10, y: 10, type: "repair_puzzle" });
interactions.on("repair_puzzle", (target, player) => { /* start the repair */ });

interactions.attemptInteraction(playerX, playerY);       // uses the closest target in range
const nearby = interactions.getTargetsInRange(playerX, playerY);
```

Also: `unregisterTarget()`, `off()`, `findClosestTarget()`, `setInteractionRange()`, `destroy()`.

### `CollisionDetector`

Checks positions against a walkability map and slides the player along walls.

```ts
import { CollisionDetector, type CollisionMap } from "./physics/Collision";

const detector = new CollisionDetector(collisionMap, playerRadius);
if (detector.isWalkable(x, y)) { /* ... */ }
const next = detector.moveWithCollision(x, y, deltaX, deltaY);
```

The map it needs:

```ts
interface CollisionMap {
  getTile(x: number, y: number): boolean; // true when walkable
  getWidth(): number;
  getHeight(): number;
}
```

## Integration points

### Train environment

The collision map is the link to the train layout. `PreviewCollisionMap` delegates to the same world-space collision rules used by the server. The collision rectangles approximate the partitions, doorways and major furniture in `client/environment/TrainEnvironment.ts`; update both when the layout changes.

### Tasks and repairs

In live mode a repair is a server rule: **E** sends a `repair` input and `shared/game.ts` advances the open task in the section the player stands in. In mock mode the interaction system checks distance to registered stations and items and displays the nearest prompt.

### Multiplayer

The synced state is `TrainState` in `shared/game.ts`; a player there has `name`, `seat`, `color`, `connected`, normalized `x` and `z`, movement input and signal. `Player.getState()` (`id`, `x`, `y`, `direction`, `isMoving`, `inventory`) is a client-side shape and is not sent anywhere. See [PLATFORM.md](PLATFORM.md) for the inputs and the adapters.

## Configuration

`config/game.json` holds the server's tuning values; for the player that is `playerSpeed` (world units per second, the train is 26 units long), used by the server in live mode.

The `Player` class takes its own options in its constructor. The mock preview passes fixed values: `speed: 5`, `maxInventorySlots: 8`, `interactionRange: 1.5`.

## Known gaps

- Live repair range is the whole section, not proximity to the visible station; the brake puzzle uses its existing dedicated controls.
- Items and inventory are mock-only, not synchronized or persisted between players; removing an item discards it rather than dropping it back into the world.
- Collision uses hand-maintained rectangular approximations rather than every decorative mesh, and does not block other players.
- The scene animates simple 3D figures rather than drawing the animator's sprite frames.
- Mock station repairs are a simple progress preview, not the live brake puzzle or authoritative game rules.

## Future work

- [ ] Sprite sheets and animated players, or animated 3D figures
- [ ] Items in the world: pick up, carry, drop, as server rules
- [ ] Sound for movement and interactions
- [ ] Sprint, stamina, equipment: only if the game design asks for them

## Testing

The classes can be tested with a browser-like window and without a network:

```ts
const player = new Player("test", 5, 5, mockCollisionMap, config);
player.update(16); // one frame

const detector = new CollisionDetector(mockCollisionMap);
assert(!detector.isWalkable(-1, 0)); // out of bounds

const inventory = new Inventory(8);
assert(inventory.addItem(testItem));
```

`tests/player-preview-controller.test.mjs` covers the mock-mode controller. The server's movement rule is covered in `shared/game.test.ts` and `room/room.test.ts`.
