
---
applyTo: "team-1/**"
---

# Project: THE LAST TRAIN

## 1. Project Overview

We are developing a cooperative online multiplayer game called
"The Last Train".

Four players are trapped aboard a moving train that is
experiencing multiple technical failures.

Players must cooperate to repair the train before the
20-minute countdown expires.

Game characteristics:
- Four-player online multiplayer.
- 2D top-down pixel-art visual style.
- Moving train environment.
- No killing, weapons or combat.
- Cooperative puzzles and repair tasks.
- Real-time player interaction.

## 2. Technology Stack

Frontend:
- JavaScript (ES6+)
- Three.js
- HTML5
- CSS3

Rendering:
- Orthographic camera.
- Top-down 2D gameplay.
- Pixel-art sprites and textures.
- Pixel-perfect rendering where practical.

Backend:
- Python.
- FastAPI (proposed backend framework).
- WebSockets for real-time communication.
- Server-authoritative game state.

Development:
- Visual Studio Code.
- Git and GitHub.
- Modular project architecture.

Do not introduce Pygame or replace Three.js.

## 3. Developer Responsibilities

There are four developers.

Developer 1 – Player Mechanics:
- Player character creation.
- Player movement using WASD.
- Four-direction movement.
- Player animations.
- Collision detection.
- Interaction system (E key).
- Item collection.
- Inventory system.
- Player identification.

Developer 2 – Train Environment:
- Train layout.
- Connected carriages.
- Engine room.
- Electrical room.
- Control cabin.
- Passenger carriage.
- Brake compartment.
- Train objects and decorations.
- Environmental animations.

Developer 3 – Tasks and Puzzles:
- Electrical repair puzzle.
- Engine repair puzzle.
- Brake repair puzzle.
- Control panel puzzle.
- Tool requirements.
- Task dependencies.
- Train condition.
- Victory conditions.

Developer 4 – Multiplayer and UI:
- Backend server.
- Multiplayer lobby.
- WebSocket communication.
- Player synchronization.
- Shared countdown timer.
- HUD.
- Task status.
- Win/loss screens.
- Integration and testing.

## 4. Architecture Rules

- Keep the frontend and backend separate.
- Use modular JavaScript files.
- Use ES modules.
- Keep player logic separate from rendering.
- Keep networking separate from gameplay logic.
- Use shared interfaces between modules.
- The server is authoritative for shared game state.
- Validate interactions on the server.
- Avoid unnecessary dependencies.
- Do not create monolithic files.

## 5. Developer 1 Specific Rules

When implementing player mechanics:

- Use Three.js for rendering.
- Use an orthographic camera.
- Implement 2D top-down movement.
- Support WASD and arrow keys.
- Normalize diagonal movement.
- Prevent movement through walls.
- Support four-direction animations.
- Use a reusable Player class.
- Keep player identity and state accessible.
- Implement interaction through a reusable system.
- Make the player compatible with multiplayer synchronization.

Do not implement the entire networking system inside the Player class.

## 6. Coding Standards

- Write clean, readable JavaScript.
- Use descriptive variable names.
- Use classes and reusable modules where appropriate.
- Add comments for complex logic.
- Avoid unnecessary code duplication.
- Handle errors properly.
- Follow existing project conventions.
- Do not modify another developer's modules without coordination.

## 7. GitHub Collaboration

- Each developer works on their own feature branch.
- Never push directly to main.
- Do not overwrite other developers' work.
- Commit small, meaningful changes.
- Use clear commit messages.
- Test before creating Pull Requests.
- Coordinate changes to shared interfaces.
- Merge through Pull Requests.

## 8. AI Assistant Behaviour

Before implementing a feature:
1. Inspect the existing project structure.
2. Understand the existing code.
3. Identify dependencies.
4. Explain the proposed implementation.
5. Avoid modifying unrelated files.

When generating code:
- Explain what each important function does.
- Keep code compatible with the existing architecture.
- Identify files that need modification.
- Do not invent existing classes or APIs.
- Ask before making large architectural changes.

The priority is a stable, modular and fully
functional four-player multiplayer game.
