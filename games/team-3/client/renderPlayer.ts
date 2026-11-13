// The part of a player the renderer needs. The full `Player` comes from the
// shared contract; the renderer only reads the id, the name and the position.
import type { Player } from "../shared/types.ts";

/** What the renderer draws for a player; `facing` turns them (#217) and is optional for tests and demos. */
export type RenderPlayer = Pick<Player, "id" | "name" | "position"> & Partial<Pick<Player, "facing">>;
