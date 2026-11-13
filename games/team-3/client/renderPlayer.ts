// The part of a player the renderer needs. The full `Player` comes from the
// shared contract; the renderer only reads the id, the name and the position.
import type { Player } from "../shared/types.ts";

export type RenderPlayer = Pick<Player, "id" | "name" | "position">;
