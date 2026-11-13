// Client-facing view of a player. Structurally compatible with `Player` in the
// shared contract (#5): once that PR is merged, import the shared type instead
// of keeping this local alias. The renderer only needs these three fields.
export interface RenderPlayer {
  id: string;
  name: string;
  /** Floor position in world units; the renderer maps it to (x, 0, y). */
  position: { x: number; y: number };
}
