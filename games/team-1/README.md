# The Last Train - Team 1 Game Setup

## Project Status

✅ **Workspace Setup** — Root configuration complete  
✅ **Platform Stubs** — @sdm/core and @sdm/host placeholders ready  
✅ **team-1 Game Structure** — Full directory layout created  
✅ **Player Mechanics Module** — Complete implementation (Developer 1)  
⏳ **Train Environment** — Awaiting Developer 2  
⏳ **Tasks & Puzzles** — Awaiting Developer 3  
⏳ **Multiplayer & Backend** — Awaiting Developer 4  

---

## What's Ready Now

### 1. **Root Workspace** (`/`)

- `package.json` — pnpm workspace with all scripts
- `pnpm-workspace.yaml` — Workspace configuration
- `tsconfig.json` — Shared TypeScript configuration
- `.gitattributes` — LF line endings
- `.env.example` — Environment variables template

### 2. **team-1 Game Structure** (`/games/team-1/`)

```
games/team-1/
├── package.json              (@team-1/game)
├── tsconfig.json             (extends root)
├── vite.config.ts            (build config)
├── index.html                (game page)
├── server.ts                 (placeholder)
│
├── config/
│   └── game.json             (player tuning values)
│
├── shared/
│   ├── game.ts               (game definition)
│   ├── types/
│   │   └── game.ts           (interfaces)
│   └── schemas/
│       └── index.ts          (Colyseus schemas)
│
├── client/
│   ├── main.ts               (entry point & game loop)
│   ├── player/
│   │   ├── Player.ts         ✅ Complete
│   │   ├── Movement.ts       ✅ Complete
│   │   ├── Animator.ts       ✅ Complete
│   │   ├── Inventory.ts      ✅ Complete
│   │   └── Interaction.ts    ✅ Complete
│   ├── input/
│   │   └── InputHandler.ts   ✅ Complete
│   ├── physics/
│   │   └── Collision.ts      ✅ Complete
│   └── renderer/
│       └── PlayerRenderer.ts ✅ Complete (basic)
│
├── room/
│   └── index.ts              (placeholder for Developer 4)
│
└── PLAYER_MECHANICS.md       (detailed documentation)
```

### 3. **Player Mechanics Module** ✅ COMPLETE

All 8 core classes implemented and documented. See [PLAYER_MECHANICS.md](./PLAYER_MECHANICS.md) for complete API reference.

---

## Quick Start

```bash
# Install dependencies
cd sdm2026-2
pnpm install

# Start development server
pnpm dev

# Run type checking
pnpm typecheck
```

---

## Documentation

- **[README.md](./README.md)** (this file) — Project overview
- **[PLAYER_MECHANICS.md](./PLAYER_MECHANICS.md)** — Complete API for all Player classes
- **[CLAUDE.md](../../CLAUDE.md)** — Repository rules
- **[the-last-train.instructions.md](./.github/instructions/the-last-train.instructions.md)** — Project requirements

---

## Module Responsibilities

| Developer | Folder | Responsibility |
|-----------|--------|-----------------|
| **Dev 1 (You)** | `client/player/` | ✅ Player mechanics (complete) |
| **Dev 2** | `client/environment/` | 🚧 Train layout & collision map |
| **Dev 3** | `shared/` | 🚧 Task definitions & puzzles |
| **Dev 4** | `room/` + `server.ts` | 🚧 Multiplayer & backend |

---

## Integration Points

**Developer 2 (Train Environment):**
- Provide `CollisionMap` implementation for movement system
- Export train layout, dimensions, and walkable tiles

**Developer 3 (Tasks & Puzzles):**
- Register puzzle targets with Player's `InteractionSystem`
- Listen for interaction callbacks

**Developer 4 (Multiplayer):**
- Sync `PlayerState` schema to all clients
- Validate movement on server
- Implement room join/leave logic

---

## Rules

- Work only in this folder (`games/team-1/`)
- Follow the workflow: issue → branch → commits → PR → review → merge
- See [CLAUDE.md](../../CLAUDE.md) for full rules
- Ask in team issues for cross-developer coordination
Work only inside this folder unless an issue says otherwise. The game runs on the shared platform since issue #240; the platform rules are in [server/CLAUDE.md](../../server/CLAUDE.md).

Start with [docs/README.md](docs/README.md): what the game is, the folder map, how to run and test it. [docs/PLATFORM.md](docs/PLATFORM.md) explains how the game talks to the server, [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) lists what is not done yet.

Quick start, from the repository root: `pnpm install`, then `cd games/team-1` and `pnpm run dev` (game server on port 2567, client on port 5173).
