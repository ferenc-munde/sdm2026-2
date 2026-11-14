# Player Mechanics Module - The Last Train

## Overview

This module implements all player mechanics for The Last Train game, developed by Developer 1. It includes:

- **Player Character System** — Main `Player` class combining all mechanics
- **Input Handling** — WASD/arrow key capture and normalization
- **Movement** — Velocity-based movement with collision detection
- **Animation System** — Four-direction sprite animation
- **Inventory System** — Item collection and storage
- **Interaction System** — E key interactions with game objects
- **Collision Detection** — AABB collision against environment
- **Three.js Rendering** — Player sprite and visual updates

## Directory Structure

```
client/
├── player/
│   ├── Player.ts              # Main player class (coordinator)
│   ├── Movement.ts            # Movement logic with collision
│   ├── Animator.ts            # Four-direction animation system
│   ├── Inventory.ts           # Item storage and management
│   └── Interaction.ts         # E key interaction system
├── input/
│   └── InputHandler.ts        # Keyboard input capture & normalization
├── physics/
│   └── Collision.ts           # AABB collision detection
├── renderer/
│   └── PlayerRenderer.ts      # Three.js player rendering
└── main.ts                    # Game initialization & loop

shared/
├── types/
│   └── game.ts                # TypeScript interfaces
└── schemas/
    └── index.ts               # Colyseus state schemas
```

## Core Classes

### `Player`

The main coordinator class that brings together all player mechanics.

```typescript
import { Player } from './client/player/Player';

const player = new Player(
  'player-1',
  startX,
  startY,
  collisionMap,
  {
    speed: 5,
    maxInventorySlots: 8,
    interactionRange: 2,
  }
);

// Main game loop
player.update(deltaTime);

// Get state for network sync
const state = player.getState();

// Manage inventory
player.addItem({ id: 'wrench', name: 'Wrench', type: 'tool', quantity: 1 });
player.hasItem('wrench');

// Interact
player.interact();
```

**Key Methods:**
- `update(deltaTime)` — Update all systems (movement, animation)
- `getState()` / `setState()` — Network synchronization
- `addItem() / removeItem() / hasItem()` — Inventory management
- `interact()` — Trigger interactions
- `getPosition() / setPosition()` — Position management
- `destroy()` — Cleanup

---

### `InputHandler`

Captures keyboard input and provides normalized movement vectors.

**Supports:**
- WASD keys
- Arrow keys
- Automatic normalization for diagonal movement

```typescript
import { InputHandler } from './client/input/InputHandler';

const input = new InputHandler();

// Get movement vector (normalized, magnitude ≤ 1)
const { x, y } = input.getMovementVector();

// Get primary direction
const direction = input.getDirection(); // 'up' | 'down' | 'left' | 'right' | null

// Check if moving
if (input.isMoving()) { ... }
```

---

### `Movement`

Handles velocity-based movement with collision detection.

```typescript
import { Movement } from './client/player/Movement';

const movement = new Movement(inputHandler, collisionMap, speed);

// Get delta movement for this frame
const delta = movement.update(deltaTime);

// Apply movement with collision response
const newPos = movement.applyMovement(currentX, currentY, delta.x, delta.y);
```

---

### `Animator`

Manages four-direction sprite animations.

```typescript
import { Animator } from './client/player/Animator';

const animator = new Animator();

// Set direction
animator.setDirection('down');

// Set whether player is moving (triggers walk vs idle animation)
animator.setMoving(true);

// Update animation state
animator.update(deltaTime);

// Get current frame index for rendering
const frameIndex = animator.getCurrentFrameIndex();
```

**Custom Animations:**
```typescript
animator.registerAnimation('walk', {
  up: [
    { frameIndex: 0, duration: 100 },
    { frameIndex: 1, duration: 100 },
    { frameIndex: 2, duration: 100 },
  ],
  down: [ ... ],
  left: [ ... ],
  right: [ ... ],
});
```

---

### `Inventory`

Item storage system with stack support.

```typescript
import { Inventory, InventoryItem } from './client/player/Inventory';

const inventory = new Inventory(8); // 8 slots max

const item: InventoryItem = {
  id: 'wrench',
  name: 'Wrench',
  type: 'tool',
  quantity: 1,
  maxStack: 1,
};

inventory.addItem(item);
inventory.removeItem('wrench', 1);
inventory.hasItem('wrench');
inventory.getItems(); // Array of all items
inventory.getSlotsUsed();
inventory.isFull();
```

---

### `InteractionSystem`

Event-based interaction system triggered by E key.

```typescript
import { InteractionSystem } from './client/player/Interaction';

const interactions = new InteractionSystem(interactionRange);

// Register an interaction target
interactions.registerTarget({
  id: 'repair-panel-1',
  x: 10,
  y: 10,
  type: 'repair_puzzle',
  onInteract: (player) => { ... },
});

// Listen for interactions
interactions.on('repair_puzzle', (target, player) => {
  console.log('Interacting with', target.name);
});

// Attempt interaction at player location
interactions.attemptInteraction(playerX, playerY);

// Find targets in range
const nearby = interactions.getTargetsInRange(playerX, playerY);
```

---

### `CollisionDetector`

AABB collision detection against a tile map.

```typescript
import { CollisionDetector } from './client/physics/Collision';

const collisionDetector = new CollisionDetector(collisionMap, playerRadius);

// Check if position is walkable
if (collisionDetector.isWalkable(x, y)) { ... }

// Move with collision (slides along walls)
const newPos = collisionDetector.moveWithCollision(x, y, deltaX, deltaY);
```

---

### `PlayerRenderer`

Three.js rendering for the player.

```typescript
import { PlayerRenderer } from './client/renderer/PlayerRenderer';

const renderer = new PlayerRenderer(player, scene);

// Update each frame
renderer.update();

// Set sprite texture
renderer.setSprite(textureMap);
```

---

## Integration Points

### 1. **Developer 2 - Train Environment**

Your collision detection requires:
- A `CollisionMap` interface implementation from the train layout
- Tile-based walkability data
- Train dimensions

```typescript
interface CollisionMap {
  getTile(x: number, y: number): boolean;
  getWidth(): number;
  getHeight(): number;
}
```

### 2. **Developer 3 - Tasks & Puzzles**

Use the **Interaction System** to connect puzzles:

```typescript
player.getInteractionSystem().registerTarget({
  id: 'electrical-panel',
  x: 15,
  y: 8,
  type: 'electrical_puzzle',
});

player.getInteractionSystem().on('electrical_puzzle', (target, player) => {
  // Trigger electrical repair puzzle
});
```

Communicate item requirements through inventory:

```typescript
if (player.hasItem('wire', 3)) {
  // Player has items needed for repair
}
```

### 3. **Developer 4 - Multiplayer & Backend**

Send player state over the network:

```typescript
const state = player.getState();
// { id, x, y, direction, isMoving, inventory }

// Receive remote player state
localPlayer.setState(remoteState);
```

The `PlayerState` schema is defined in `shared/schemas/index.ts` using Colyseus `@schema`.

---

## Configuration

Edit `config/game.json` to tune player mechanics:

```json
{
  "player": {
    "speed": 5,              // Pixels per second
    "animationFrameRate": 10,// Milliseconds per frame
    "interactionRange": 2    // Pixels
  },
  "inventory": {
    "maxSlots": 8            // Max items to carry
  }
}
```

---

## Usage Example

```typescript
import { Player } from './client/player/Player';

// Create player
const player = new Player(
  'player-1',
  10,
  10,
  collisionMap,
  { speed: 5, maxInventorySlots: 8, interactionRange: 2 }
);

// Game loop
function gameLoop(deltaTime) {
  // Update player mechanics
  player.update(deltaTime);

  // Get state for rendering/networking
  const state = player.getState();

  // Sync to network (Developer 4)
  networkManager.sendPlayerState(state);

  // Render (use renderer)
  playerRenderer.update();

  // Respond to interactions (Developer 3)
  // Handled automatically via InteractionSystem callbacks
}

// Cleanup
window.addEventListener('beforeunload', () => {
  player.destroy();
});
```

---

## TODO / Future Work

- [ ] Load sprite textures and implement sprite sheet rendering
- [ ] Add sprint/crouch movement variants
- [ ] Implement stamina system
- [ ] Add sound effects for movement/interactions
- [ ] Polish animation transitions
- [ ] Network interpolation/prediction
- [ ] Item drop system
- [ ] Death/respawn system
- [ ] Equipment/equip items (hats, tools displayed)

---

## Testing

The module is designed to be testable in isolation:

```typescript
// Can test without networking
const player = new Player('test', 0, 0, mockCollisionMap, config);
player.update(16); // Simulate one frame
assert(player.getPosition().y > 0); // Player moved if input was active

// Can test collision separately
const detector = new CollisionDetector(mockMap);
assert(!detector.isWalkable(-1, 0)); // Out of bounds

// Can test inventory separately
const inventory = new Inventory(8);
assert(inventory.addItem(testItem));
assert(!inventory.addItem(testItem) && inventory.isFull()); // When full
```

---

## Notes for Integration

1. **Collision Map** — Requires Developer 2's train layout export
2. **Sprites** — Add PNG files to `assets/sprites/` once available
3. **Network State** — Coordinate with Developer 4 on serialization format
4. **Task Interaction** — Register targets via `InteractionSystem` from Developer 3's puzzle code
5. **Item Types** — Define standard item types for consistency across developers

---

**Author:** Developer 1 (Player Mechanics)  
**Module Status:** ✅ Core structure complete, sprites & networking pending
