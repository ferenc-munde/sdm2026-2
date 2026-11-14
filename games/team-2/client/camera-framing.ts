import { CAR_SPACING, CAR_WIDTH, CAR_X, MAP_HEIGHT, MAP_WIDTH } from "../shared/map.ts";

export interface CameraTarget { x: number; y: number }
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Client-only framing in map coordinates. Never changes a player's position. */
export function followFrame(player: CameraTarget, aspect: number) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = Math.max(CAR_SPACING * 2.2, (CAR_WIDTH + 96) / ratio);
  const width = height * ratio;
  const minY = Math.min(height / 2, MAP_HEIGHT / 2);
  const maxY = Math.max(MAP_HEIGHT - height / 2, MAP_HEIGHT / 2);
  return {
    width, height,
    // Keep the full carriage width visible instead of panning sideways in its aisle.
    centerX: clamp(CAR_X + CAR_WIDTH / 2, Math.min(width / 2, MAP_WIDTH / 2), Math.max(MAP_WIDTH - width / 2, MAP_WIDTH / 2)),
    centerY: clamp(Number.isFinite(player.y) ? player.y : MAP_HEIGHT / 2, minY, maxY),
  };
}

export function localCameraTarget<T extends CameraTarget>(players: Iterable<[string, T]>, localId?: string): CameraTarget | null {
  if (!localId) return null;
  for (const [id, player] of players) {
    if (id === localId && Number.isFinite(player.x) && Number.isFinite(player.y)) return { x: player.x, y: player.y };
  }
  return null;
}

export function smoothCameraY(current: number, target: number, dt: number) {
  const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  return current + (target - current) * (1 - Math.exp(-9 * seconds));
}
